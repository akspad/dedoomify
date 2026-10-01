import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, extractArticle, fetchHtml, isPrivateAddress } from "../lib/fetch-article.js";
import { dedoomArticle } from "../lib/dedoom.js";
import { splitForLlm } from "../lib/llm.js";
import handler from "../api/dedoom.js";

const ARTICLE_HTML = `<!doctype html><html><head><title>Is AI misaligned?</title></head><body>
<nav>Home | About</nav>
<article>
  <h1>Is AI misaligned?</h1>
  <p class="byline">By Jane Writer</p>
  <p>Researchers say the new model is misaligned and poses an existential risk to everyone who uses it, according to a report released on Tuesday by a group of academics.</p>
  <p>The company disagreed. It said the system passed every internal test and that customers had reported no serious problems in the three months since launch.</p>
  <h2>What critics say</h2>
  <p>Critics warned that a rogue AI could emerge within years, and that superintelligence would follow soon after, unless regulators act quickly and decisively.</p>
</article>
<footer>Copyright</footer>
</body></html>`;

test("blocks private and non-http addresses", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress("93.184.216.34"));
  await assert.rejects(assertPublicUrl("http://127.0.0.1/"), /publicly reachable/);
  await assert.rejects(assertPublicUrl("http://[::1]/"), /publicly reachable/);
  await assert.rejects(assertPublicUrl("http://localhost:3000/"), /publicly reachable/);
  await assert.rejects(assertPublicUrl("file:///etc/passwd"), /http and https/);
  await assert.rejects(assertPublicUrl("not a url"), /valid URL/);
});

test("refuses redirects to private addresses", async () => {
  const fakeFetch = async () =>
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
  await assert.rejects(fetchHtml("http://93.184.216.34/", fakeFetch), /publicly reachable/);
});

test("accepts big news pages but refuses huge ones", async () => {
  const page = (mb) => async () =>
    new Response("<p>" + "x".repeat(mb * 1024 * 1024) + "</p>", { headers: { "content-type": "text/html" } });
  const { html } = await fetchHtml("http://93.184.216.34/", page(8));
  assert.ok(html.length > 8 * 1024 * 1024);
  await assert.rejects(fetchHtml("http://93.184.216.34/", page(16)), /too big/);
});

test("extracts the article body", () => {
  const article = extractArticle(ARTICLE_HTML, "https://example.com/a");
  assert.equal(article.title, "Is AI misaligned?");
  assert.ok(article.blocks.some((b) => b.type === "heading" && b.text === "What critics say"));
  assert.ok(article.blocks.some((b) => b.text.startsWith("Researchers say")));
  assert.ok(!article.blocks.some((b) => b.text.includes("Copyright")));
});

test("rules mode rewrites the title and body", async () => {
  const article = extractArticle(ARTICLE_HTML, "https://example.com/a");
  const result = await dedoomArticle(article, { mode: "rules" });
  assert.equal(result.engine, "rules");
  assert.equal(result.title, "Is AI buggy?");
  assert.equal(result.originalTitle, "Is AI misaligned?");
  const first = result.blocks.find((b) => b.original.startsWith("Researchers"));
  assert.match(first.text, /the new model has a bug and poses a product risk to everyone/);
  assert.ok(result.changed >= 2);
});

test("uses Claude when configured and falls back to rules when it fails", async (t) => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  t.after(() => delete process.env.ANTHROPIC_API_KEY);
  const article = { title: "Doom", blocks: [{ type: "paragraph", text: "It is misaligned." }] };

  const ok = await dedoomArticle(article, { llm: async (texts) => texts.map((s) => s.toUpperCase()) });
  assert.equal(ok.engine, "claude");
  assert.equal(ok.title, "DOOM");
  assert.equal(ok.blocks[0].text, "IT IS MISALIGNED.");

  const failed = await dedoomArticle(article, {
    llm: async () => { throw new Error("boom"); },
    log: { error() {} },
  });
  assert.equal(failed.engine, "rules");
  assert.equal(failed.blocks[0].text, "It has a bug.");
  assert.match(failed.notice, /quick phrase rules/);
});

test("long articles send only the first part to Claude", () => {
  const [head, tail] = splitForLlm(["aaaa", "bbbb", "cccc"], 9);
  assert.deepEqual(head, ["aaaa", "bbbb"]);
  assert.deepEqual(tail, ["cccc"]);
});

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: "" };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b; };
  return res;
}

test("GET /api/dedoom returns a cacheable rewrite", async () => {
  const res = fakeRes();
  await handler({ method: "GET", url: "/api/dedoom?url=https://example.com/a&mode=rules" }, res, {
    fetchArticle: async (url) => ({ ...extractArticle(ARTICLE_HTML, url), url }),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["cache-control"], /s-maxage/);
  assert.equal(JSON.parse(res.body).title, "Is AI buggy?");
});

test("POST /api/dedoom rewrites pasted text", async () => {
  const res = fakeRes();
  await handler({ method: "POST", url: "/api/dedoom", body: { text: "It is misaligned.\n\nAll good.", mode: "rules" } }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.blocks.map((b) => b.text), ["It has a bug.", "All good."]);
});

test("API reports bad input clearly", async () => {
  let res = fakeRes();
  await handler({ method: "GET", url: "/api/dedoom" }, res);
  assert.equal(res.statusCode, 400);
  res = fakeRes();
  await handler({ method: "GET", url: "/api/dedoom?url=http://127.0.0.1/" }, res);
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /publicly reachable/);
  res = fakeRes();
  await handler({ method: "DELETE", url: "/api/dedoom" }, res);
  assert.equal(res.statusCode, 405);
});
