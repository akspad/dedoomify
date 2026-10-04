import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import "../shared/dedoom-core.js";
import "../shared/page-dedoom.js";
import "../public/diff.js";
import { createHash } from "node:crypto";
import { renderPage, PAGE_CSP, PAGE_SCRIPT } from "../lib/page.js";
import handler from "../api/page.js";

const { collectGroups, groupStrings, rewriteGroup, dedoomElement } = globalThis.DedoomPage;
const { diffEdits } = globalThis.DedoomDiff;

const PAGE = `<!doctype html><html><head>
<title>Is AI misaligned?</title>
<base href="/news/">
<link rel="stylesheet" href="site.css">
<link rel="preload" href="x.js" as="script">
<meta http-equiv="refresh" content="0; url=https://evil.example">
<script>alert(1)</script>
</head><body class="story">
<header><nav><a href="/">Home</a></nav></header>
<article>
  <h1 class="headline">Is AI misaligned?</h1>
  <p onclick="steal()">Researchers say the new model <em>is
    misaligned</em> and could go rogue, according to <a href="report.html" target="_self">a report</a>.</p>
  <p>Revenue rose 12 percent.</p>
  <pre>model.is_misaligned = True  # misaligned</pre>
  <img data-src="real.jpg" src="data:image/gif;base64,R0lGOD">
  <a href="javascript:alert(1)">bad link</a>
  <iframe src="https://ads.example"></iframe>
</article>
</body></html>`;

function apply(html, fn) {
  const { document } = parseHTML(html);
  fn(document);
  return document;
}

test("keeps the page's markup and marks changed phrases in place", () => {
  const { html, title, changed } = renderPage(PAGE, "https://example.com/news/story");
  const { document } = parseHTML(html);
  assert.equal(title, "Is AI buggy?");
  assert.ok(changed >= 3, `changed ${changed}`);
  assert.equal(document.querySelector("h1").className, "headline");
  assert.equal(document.body.className, "story");
  // A phrase split across an inline tag and a line break is still found.
  const marks = [...document.querySelectorAll("article p mark.dd")];
  assert.deepEqual(marks.map((m) => m.textContent), ["has a bug", "malfunction"]);
  assert.equal(marks[0].getAttribute("data-was"), "is\n    misaligned");
  assert.equal(marks[0].parentNode.tagName, "EM");
  assert.match(document.querySelector("article p").textContent.replace(/\s+/g, " "), /the new model has a bug and could malfunction, according to a report\./);
  // Code is left alone.
  assert.equal(document.querySelector("pre").textContent, "model.is_misaligned = True  # misaligned");
});

test("strips scripts and anything that could run code or navigate", () => {
  const { html } = renderPage(PAGE, "https://example.com/news/story");
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll("iframe, meta[http-equiv]").length, 0);
  assert.doesNotMatch(html, /alert\(1\)/);
  assert.equal(document.querySelector('link[rel="preload"]'), null);
  assert.ok(document.querySelector('link[rel="stylesheet"]'));
  assert.equal(document.querySelector("[onclick]"), null);
  assert.equal(document.querySelector('a[href^="javascript"]'), null);
  for (const a of document.querySelectorAll("a")) assert.equal(a.getAttribute("target"), "_blank");
  // Relative URLs resolve against the page's own base.
  const bases = document.querySelectorAll("base");
  assert.equal(bases.length, 1);
  assert.equal(bases[0].getAttribute("href"), "https://example.com/news/");
  assert.equal(document.head.firstElementChild.getAttribute("charset"), "utf-8");
  assert.ok(document.querySelector("style#dedoomify-style"));
  // Lazy-loaded images get their real source.
  assert.equal(document.querySelector("img").getAttribute("src"), "real.jpg");
  assert.match(html, /^<!DOCTYPE html>/);
});

test("the frame's policy allows only the hover card's script", () => {
  assert.match(PAGE_CSP, /default-src 'none'/);
  const scriptSrc = PAGE_CSP.split("; ").find((d) => d.startsWith("script-src"));
  const hash = createHash("sha256").update(PAGE_SCRIPT).digest("base64");
  assert.equal(scriptSrc, `script-src 'sha256-${hash}'`);
  // The page carries exactly that script and no other.
  const { html } = renderPage(PAGE, "https://example.com/news/story");
  const { document } = parseHTML(html);
  const scripts = [...document.querySelectorAll("script")];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].textContent, PAGE_SCRIPT);
  assert.equal(scripts[0].attributes.length, 0);
});

test("does not rewrite direct quotations in page view", () => {
  const html = '<html><head><title>AI story</title></head><body><p>She said, “the model is misaligned.” Outside the quote, the model is misaligned.</p></body></html>';
  const { html: rendered } = renderPage(html, "https://example.com/story");
  const { document } = parseHTML(rendered);
  const p = document.querySelector("p");
  assert.match(p.textContent, /“the model is misaligned\.”/);
  assert.match(p.textContent, /Outside the quote, the model has a bug\./);
  assert.equal(p.querySelectorAll("mark.dd").length, 1);
});

test("groups break at block elements but not inline ones", () => {
  const document = apply("<div>AI is <b>very</b> smart<p>and is</p> misaligned</div>", () => {});
  const groups = collectGroups(document.querySelector("div")).map((g) => g.map((n) => n.nodeValue).join(""));
  assert.deepEqual(groups, ["AI is very smart", "and is", " misaligned"]);
});

test("rewrites from the model replace only the words that changed, across tags", () => {
  const document = apply('<p id="p">The model <a href="#">decided to</a> deceive   its users in 2025.</p>', (doc) => {
    dedoomElement(doc.body, doc);
  });
  const p = document.getElementById("p");
  const [nodes] = collectGroups(p);
  const { original } = groupStrings(nodes);
  assert.equal(original, "The model decided to deceive   its users in 2025.");
  rewriteGroup(nodes, document, "The model produced misleading output for its users in 2025.", diffEdits);
  assert.equal(p.textContent.replace(/\s+/g, " "), "The model produced misleading output for its users in 2025.");
  const marks = [...p.querySelectorAll("mark.dd")];
  assert.equal(marks.length, 1);
  assert.equal(marks[0].textContent, "produced misleading output for");
  assert.equal(marks[0].getAttribute("data-was"), "decided to deceive");
  // Rewriting again starts from the original text, not the previous rewrite.
  const [again] = collectGroups(p);
  assert.equal(groupStrings(again).original, "The model decided to deceive   its users in 2025.");
});

test("rule edits that remove words become deletions", () => {
  const document = apply("<p>x</p>", () => {});
  const p = document.querySelector("p");
  p.textContent = "a b c d";
  const [nodes] = collectGroups(p);
  rewriteGroup(nodes, document, "a b d", diffEdits);
  assert.equal(p.querySelector("del.dd").textContent, "c ");
  assert.equal(p.querySelector("mark"), null);
});

test("diff edits rebuild the rewritten text", () => {
  const cases = [
    ["Experts warn the model is misaligned and could go rogue by 2030.", "Experts warn the model has a bug and could malfunction by 2030."],
    ["a b c d", "a b d"],
    ["a b c", "a b c d"],
    ["x", "y z"],
    ["same", "same"],
    ["The model is misaligned and dangerous.", "The model has a bug and dangerous."],
  ];
  for (const [before, after] of cases) {
    let out = before;
    for (const e of [...diffEdits(before, after)].reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    assert.equal(out, after, before);
  }
  assert.deepEqual(diffEdits("The model is misaligned and dangerous.", "The model has a bug and dangerous."), [
    { start: 10, end: 23, text: "has a bug" },
  ]);
});

function call(url, headers = {}, deps) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); },
    };
    handler({ method: "GET", url, headers }, res, deps);
  });
}

test("page endpoint serves the rewritten page with a strict policy", async () => {
  const fetchHtml = async (u) => ({ html: PAGE, finalUrl: u, contentType: "text/html" });
  const r = await call("/api/page?url=" + encodeURIComponent("https://example.com/a"), { "sec-fetch-dest": "iframe" }, { fetchHtml });
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-security-policy"], PAGE_CSP);
  assert.match(r.headers["content-type"], /text\/html/);
  assert.match(r.body, /<mark [^>]*data-was="go rogue"[^>]*>malfunction<\/mark>/);
});

test("page endpoint sends people who open it directly to the site", async () => {
  const r = await call("/api/page?url=" + encodeURIComponent("https://example.com/a"), { "sec-fetch-dest": "document" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, "/?url=" + encodeURIComponent("https://example.com/a"));
});

test("page endpoint reports errors in a way the site can read", async () => {
  const r = await call("/api/page?url=" + encodeURIComponent("http://127.0.0.1/"), { "sec-fetch-dest": "iframe" });
  assert.equal(r.status, 400);
  assert.match(r.body, /<meta name="dedoomify-error" content="That address isn&#39;t publicly reachable.">/);
});
