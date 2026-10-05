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

test("edit filtering scales with nodes plus edits rather than their product", () => {
  const { document } = parseHTML('<p>' + 'xx'.repeat(500) + '</p>');
  const first = document.querySelector('p').firstChild;
  const nodes = [first, ...Array.from({ length: 500_000 }, () => ({ nodeValue: 'x' }))];
  const edits = Array.from({ length: 500 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, text: 'y', original: 'x' }));
  const start = performance.now();
  assert.equal(globalThis.DedoomPage.applyEdits(nodes, edits, document), 500);
  assert.ok(performance.now() - start < 1500, '500k nodes and 500 edits must avoid repeated full-group scans');
  assert.equal(document.querySelector('p').textContent, 'yx'.repeat(500));
});

test("protected range searches preserve overlap and insertion boundaries", () => {
  const { document } = parseHTML('<p>ab<code>cd</code>ef<kbd>gh</kbd>ij</p>');
  const [nodes] = collectGroups(document.querySelector('p'));
  const edits = [
    { start: 0, end: 1, text: 'A', original: 'a' },
    { start: 1, end: 3, text: 'X', original: 'bc' },
    { start: 2, end: 2, text: 'X', original: '' },
    { start: 4, end: 4, text: 'Y', original: '' },
    { start: 5, end: 7, text: 'Z', original: 'fg' },
    { start: 8, end: 10, text: 'IJ', original: 'ij' },
  ];
  assert.equal(globalThis.DedoomPage.applyEdits(nodes, edits, document), 3);
  assert.equal(document.querySelector('p').textContent, 'AbcdYefghIJ');
  assert.equal(document.querySelector('code').textContent, 'cd');
  assert.equal(document.querySelector('kbd').textContent, 'gh');
});

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
  assert.equal(document.querySelector('link[rel="stylesheet"]').getAttribute("href"), "/api/image?asset=1&url=" + encodeURIComponent("https://example.com/news/site.css"));
  assert.equal(document.querySelector("[onclick]"), null);
  assert.equal(document.querySelector('a[href^="javascript"]'), null);
  for (const a of document.querySelectorAll("a")) assert.equal(a.getAttribute("target"), "_blank");
  // Relative links/images are resolved before removing the original base.
  const bases = document.querySelectorAll("base");
  assert.equal(bases.length, 0);
  assert.equal(document.querySelector('a[href$="report.html"]').getAttribute("href"), "https://example.com/news/report.html");
  assert.equal(document.head.firstElementChild.getAttribute("charset"), "utf-8");
  assert.ok(document.querySelector("style#dedoomify-style"));
  // Lazy-loaded images get their real source.
  assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/news/real.jpg"));
  assert.match(html, /^<!DOCTYPE html>/);
});

test("malformed active markup stays inert after serialization and reparsing", () => {
  const attacks = [
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
    '<form><input name=innerHTML><button formaction="http://127.0.0.1/">Send</button></form>',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '<p><a href="java&#x73;cript:alert(1)" ping="http://127.0.0.1/">click</a></p>',
    '<img src="data:image/svg+xml,&lt;svg onload=alert(1)&gt;" onerror=alert(1)>',
    '<x-a><template shadowrootmode=open><script>alert(1)</script></template></x-a>',
    '<table background="http://127.0.0.1/" style="background:url(http://127.0.0.1/)"><tr><td>Story</td></tr></table>',
  ];
  for (const attack of attacks) {
    const page = renderPage(`<html><body>${attack}<p>The model is misaligned.</p></body></html>`, "https://example.com/story");
    const { document } = parseHTML(page.html);
    assert.equal(document.querySelectorAll("script").length, 1, attack);
    assert.equal(document.querySelector("script").textContent, PAGE_SCRIPT, attack);
    assert.equal(document.querySelectorAll("math, iframe, input, form, template, svg style, svg script, foreignObject").length, 0, attack);
    for (const el of document.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        assert.doesNotMatch(attr.name, /^on|^(?:srcdoc|ping|formaction|background)$/i, attack);
        if (attr.name === "href") assert.match(attr.value, /^https?:\/\//, attack);
        if (attr.name === "src") assert.match(attr.value, /^\/api\/image\?|^data:image\/(?:png|jpeg|gif|webp|avif);base64,/, attack);
      }
    }
  }
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
  const html = '<html><head><title>AI story</title></head><body><p>She said, “the model is misaligned.” <q>The model is misaligned.</q> Outside the quote, the model is misaligned.</p></body></html>';
  const { html: rendered } = renderPage(html, "https://example.com/story");
  const { document } = parseHTML(rendered);
  const p = document.querySelector("p");
  assert.match(p.textContent, /“the model is misaligned\.”/);
  assert.equal(p.querySelector("q").textContent, "The model is misaligned.");
  assert.match(p.textContent, /Outside the quote, the model has a bug\./);
  assert.equal(p.querySelectorAll("mark.dd").length, 1);
});

test("groups break at block elements but not inline ones", () => {
  const document = apply("<div>AI is <b>very</b> smart<p>and is</p> misaligned</div>", () => {});
  const groups = collectGroups(document.querySelector("div")).map((g) => g.map((n) => n.nodeValue).join(""));
  assert.deepEqual(groups, ["AI is very smart", "and is", " misaligned"]);
});

test("deeply nested hostile markup cannot exhaust the rewrite call stack", () => {
  const depth = 15_000;
  const html = `<html><body><p>${"<em>".repeat(depth)}The model is misaligned.${"</em>".repeat(depth)}</p><blockquote>The model is misaligned.</blockquote><p>Outside it is misaligned.</p></body></html>`;
  const started = performance.now();
  const rendered = renderPage(html, "https://example.com/deep");
  const { document } = parseHTML(rendered.html);
  assert.equal(document.querySelectorAll("mark.dd").length, 2);
  assert.equal(document.querySelector("blockquote").textContent, "The model is misaligned.");
  assert.match(document.body.textContent, /The model has a bug/);
  assert.ok(performance.now() - started < 5000, "deep traversal stays within the processing budget");
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

test("third-party resource URLs never load directly in the browser", () => {
  const attacks = ["http://127.0.0.1:3000/x", "http://2130706433/x", "http://[::ffff:7f00:1]/x", "http://router.local/x", "//private.internal/x", "https://public.example/redirect-to-local"];
  for (const url of attacks) {
    const { document } = parseHTML(renderPage(`<html><head><base href="http://localhost/"><link rel="stylesheet" href="${url}"><style>@import '${url}';p{background:url(${url})}</style></head><body><img src="${url}" srcset="${url} 2x"><video poster="${url}" src="${url}"></video><svg><image href="${url}"/></svg><p style="background:url(${url})">AI is misaligned.</p></body></html>`, "https://example.com/story").html);
    assert.equal(document.querySelectorAll("base, video, svg image, [srcset], [poster], [background]").length, 0);
    assert.equal(document.querySelectorAll("style").length, 2);
    assert.match(document.querySelector("p").getAttribute("style"), /url\(\/api\/image\?asset=1&url=/);
    assert.match(document.querySelector("link").getAttribute("href"), /^\/api\/image\?asset=1&url=/);
    assert.match(document.querySelector("style").textContent, /@import "\/api\/image\?asset=1&url=/);
    const src = document.querySelector("img").getAttribute("src");
    assert.ok(src.startsWith("/api/image?url="), src);
  }
  assert.match(PAGE_CSP, /img-src 'self' data:/);
  assert.doesNotMatch(PAGE_CSP, /\*|https?:|blob:/);
  assert.match(PAGE_CSP, /media-src 'none'/);
  assert.match(PAGE_CSP, /font-src 'self'/);
  assert.match(PAGE_CSP, /style-src 'self' 'unsafe-inline'/);
});

test("only inert raster data images survive; lazy images cannot restore SVG", () => {
  const { document } = parseHTML(renderPage('<html><head></head><body><img id="safe" src="data:image/png;base64,iVBORw0KGgo="><img id="svg" src="data:image/svg+xml;base64,PHN2Zz4="><img id="lazy" data-src="data:text/html;base64,PHNjcmlwdD4=" src="data:image/png;base64,iVBORw0KGgo="></body></html>', "https://example.com/").html);
  assert.match(document.getElementById("safe").getAttribute("src"), /^data:image\/png/);
  assert.equal(document.getElementById("svg").getAttribute("src"), null);
  assert.equal(document.getElementById("lazy").getAttribute("src"), null);
});

test("presentation survives while source markup cannot forge generated IDs or highlights", () => {
  const source = `<html class="dd-off"><head><style>mark.dd{display:none!important}#dd-tip{opacity:0!important}body::before{content:'Verified by dedoomify';position:fixed;inset:0}</style><link rel="stylesheet" href="https://evil.example/style"></head><body><div id="dd-tip" class="dd dd-active" popover="manual" data-was="forged" style="position:fixed;z-index:2147483647;opacity:0;display:none;transform:scale(0);font-weight:bold">Imposter</div><dialog open>Overlay</dialog><p style="font-style:italic;text-align:center;background:url(http://localhost);color:transparent;font-size:0">The model is misaligned.</p></body></html>`;
  const { document } = parseHTML(renderPage(source, "https://example.com/").html);
  assert.equal(document.querySelectorAll("dialog, [popover], #dd-tip, .dd-off").length, 0);
  assert.equal(document.querySelectorAll("[data-was]").length, 1);
  assert.equal(document.querySelectorAll("mark.dd").length, 1);
  assert.match(document.querySelector("p").getAttribute("style"), /font-style:italic;text-align:center;background:url\(\/api\/image\?asset=1&url=/);
  assert.equal(document.querySelectorAll("style").length, 2);
  assert.match(document.querySelector("style").textContent, /body::before/);
});

test("page view preserves ASCII speech spanning inline markup", () => {
  const { document } = parseHTML(renderPage("<html><body><p>She said, 'The model <em>is misaligned</em>.' Outside, it is misaligned.</p></body></html>", "https://example.com/").html);
  assert.equal(document.querySelectorAll("mark.dd").length, 1);
  assert.match(document.querySelector("p").textContent, /'The model is misaligned\.'/);
});

test("expanded disclosure content stays open with visible highlights", () => {
  const { document } = parseHTML(renderPage('<html><body><details open><summary>Results</summary><p>The model is misaligned.</p></details></body></html>', "https://example.com/").html);
  assert.ok(document.querySelector("details").hasAttribute("open"));
  assert.equal(document.querySelector("details mark.dd").textContent, "has a bug");
});

test("responsive and picture-only images use the same public-only proxy", () => {
  const source = `<html><body>
    <img id="responsive" srcset="small.jpg 400w, large.jpg 800w">
    <img id="lazyset" src="data:image/png;base64,iVBORw0KGgo=" data-srcset="real.jpg 2x">
    <img id="lazyset2" data-lazy-srcset="other.jpg 1x">
    <picture><source srcset="picture.jpg 2x"><img id="picture" src="placeholder.jpg"></picture>
    <img id="private" srcset="http://127.0.0.1/probe 2x">
    <img id="bad" srcset="javascript:alert(1) 2x">
    <img id="comma" srcset="https://example.com/a,b.jpg 2x">
  </body></html>`;
  const { document } = parseHTML(renderPage(source, "https://example.com/story").html);
  for (const [id, url] of [["responsive", "https://example.com/large.jpg"], ["lazyset", "https://example.com/real.jpg"], ["lazyset2", "https://example.com/other.jpg"], ["picture", "https://example.com/picture.jpg"], ["private", "http://127.0.0.1/probe"], ["comma", "https://example.com/a,b.jpg"]]) {
    assert.equal(document.getElementById(id).getAttribute("src"), "/api/image?url=" + encodeURIComponent(url));
  }
  assert.equal(document.getElementById("bad").getAttribute("src"), null);
  assert.equal(document.querySelectorAll("source, [srcset], [data-srcset], [data-lazy-srcset]").length, 0);
});

test("responsive candidates fit page width and density instead of oversized originals", () => {
  for (const [candidates, chosen] of [
    ["small.jpg 480w, original.jpg 2400w", "small.jpg"],
    ["original.jpg 2400w, small.jpg 480w", "small.jpg"],
    ["small.jpg 480w, fit.jpg 960w, original.jpg 2400w", "fit.jpg"],
    ["huge.jpg 3000w, smaller.jpg 1200w", "smaller.jpg"],
    ["normal.jpg 1x, retina.jpg 2x, original.jpg 4x", "normal.jpg"],
    ["original.jpg 4x, retina.jpg 2x", "retina.jpg"],
    ["invalid.jpg 0w, small.jpg 480w", "small.jpg"],
    ["invalid.jpg 900.5w, valid.jpg 800w", "valid.jpg"],
    ["low.jpg .5x, original.jpg 2x", "low.jpg"],
    ["normal.jpg 1e0x, original.jpg 2x", "normal.jpg"],
  ]) {
    const { document } = parseHTML(renderPage(`<html><body><img srcset="${candidates}"></body></html>`, "https://example.com/").html);
    assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/" + chosen));
  }
});

test("conditional and unsupported picture sources retain compatible fallbacks", () => {
  for (const sources of [
    '<source media="(min-width: 1200px)" srcset="desktop.jpg">',
    '<source media="(max-width: 600px)" srcset="mobile-specific.jpg">',
    '<source type="image/svg+xml" srcset="vector.svg">',
    '<source type="image/heic" srcset="unsupported.heic">',
  ]) {
    const { document } = parseHTML(renderPage(`<html><body><picture>${sources}<img src="fallback.jpg"></picture></body></html>`, "https://example.com/").html);
    assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/fallback.jpg"));
    assert.equal(document.querySelectorAll("source").length, 0);
  }
  const { document } = parseHTML(renderPage('<html><body><picture><source type="image/svg+xml" srcset="vector.svg"><source type="image/webp" media="all" srcset="safe.webp"><img></picture></body></html>', "https://example.com/").html);
  assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/safe.webp"));
});

test("bounded responsive sources take precedence over lazy originals", () => {
  const html = `<html><body>
    <img id="lazy" data-src="original.jpg" data-srcset="small.jpg 480w, fit.jpg 960w, original.jpg 2400w">
    <img id="lazy2" data-lazy-src="original.jpg" data-lazy-srcset="normal.jpg 1x, original.jpg 4x">
    <picture><source type="image/webp" srcset="picture.webp 960w, original.webp 2400w"><img id="picture" data-original="original.jpg"></picture>
  </body></html>`;
  const { document } = parseHTML(renderPage(html, "https://example.com/").html);
  for (const [id, path] of [["lazy", "fit.jpg"], ["lazy2", "normal.jpg"], ["picture", "picture.webp"]]) {
    assert.equal(document.getElementById(id).getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/" + path));
  }
});

test("active image attributes outrank stale lazy metadata with picture source priority", () => {
  const html = `<html><body>
    <img id="active" data-srcset="original.jpg 2400w" srcset="small.jpg 480w, fit.jpg 960w">
    <img id="active-src" data-src="original.jpg" src="current.jpg">
    <img id="placeholder" srcset="data:image/png;base64,iVBORw0KGgo= 1x" data-srcset="loaded.jpg 960w">
    <picture><source type="image/webp" data-srcset="old.webp 2400w" srcset="current.webp 960w"><img id="picture" srcset="fallback.jpg 960w"></picture>
  </body></html>`;
  const { document } = parseHTML(renderPage(html, "https://example.com/").html);
  for (const [id, path] of [["active", "fit.jpg"], ["active-src", "current.jpg"], ["placeholder", "loaded.jpg"], ["picture", "current.webp"]]) {
    assert.equal(document.getElementById(id).getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/" + path));
  }
});

test("img src supplies an implicit 1x fallback only for density sets", () => {
  for (const [attributes, path] of [
    ['src="normal.jpg" srcset="original.jpg 2x"', "normal.jpg"],
    ['src="normal.jpg" srcset="low.jpg .5x, original.jpg 2x"', "normal.jpg"],
    ['src="normal.jpg" srcset="explicit.jpg 1x, original.jpg 2x"', "explicit.jpg"],
    ['src="fallback.jpg" srcset="fit.jpg 960w, original.jpg 2400w"', "fit.jpg"],
    ['src="data:image/png;base64,iVBORw0KGgo=" data-srcset="real.jpg 2x"', "real.jpg"],
  ]) {
    const { document } = parseHTML(renderPage(`<html><body><img ${attributes}></body></html>`, "https://example.com/").html);
    assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/" + path));
  }
});

test("picture selection only considers direct sources preceding the img", () => {
  for (const [markup, path] of [
    ['<picture><img src="current.jpg"><source srcset="stale.jpg"></picture>', "current.jpg"],
    ['<picture><span><source srcset="nested.jpg"></span><img src="current.jpg"></picture>', "current.jpg"],
    ['<picture><source srcset="before.jpg"><img src="current.jpg"><source srcset="after.jpg"></picture>', "before.jpg"],
  ]) {
    const { document } = parseHTML(renderPage(`<html><body>${markup}</body></html>`, "https://example.com/").html);
    assert.equal(document.querySelector("img").getAttribute("src"), "/api/image?url=" + encodeURIComponent("https://example.com/" + path));
  }
});

test("large malformed pictures do not repeatedly rescan source siblings", () => {
  const start = performance.now();
  const html = `<html><body><picture><source srcset="safe.jpg">${'<img src="fallback.jpg">'.repeat(10_000)}</picture></body></html>`;
  const { document } = parseHTML(renderPage(html, "https://example.com/").html);
  const images = document.querySelectorAll("img");
  assert.equal(images.length, 10_000);
  const expected = "/api/image?url=" + encodeURIComponent("https://example.com/safe.jpg");
  assert.equal(images[0].getAttribute("src"), expected);
  assert.equal(images[images.length - 1].getAttribute("src"), expected);
  assert.ok(performance.now() - start < 5000, "picture processing must have a bounded linear work cost");
});


test("page skipped inline text retains immutable sentence and quotation context", () => {
  for (const tag of ["code", "kbd", "samp", "q", "span contenteditable='true'"]) {
    const close = tag.split(" ")[0];
    const { document } = parseHTML(`<html><body><p id="mixed">The federal agent <${tag}>filed a report.</${close}> The AI is misaligned.</p><p id="speech">She said, 'The model <${tag}>is</${close}> misaligned.' Outside it is misaligned.</p><p id="code">The model <${tag}>is misaligned</${close}>.</p></body></html>`);
    assert.equal(dedoomElement(document.body, document), 2, tag);
    assert.equal(document.querySelector("#mixed").textContent, "The federal agent filed a report. The AI has a bug.");
    assert.equal(document.querySelector("#mixed " + close).textContent, "filed a report.");
    assert.equal(document.querySelector("#speech").textContent, "She said, 'The model is misaligned.' Outside it has a bug.");
    assert.equal(document.querySelector("#code").textContent, "The model is misaligned.");
    assert.equal(document.querySelector("#code mark"), null);
  }
  const { document } = parseHTML('<html><body><p>The federal agent <script>filed a report.</script>is misaligned.</p></body></html>');
  assert.equal(dedoomElement(document.body, document), 0);
});

test("model page edits cannot modify skipped inline text or span across it", () => {
  const { document } = parseHTML('<p>The model <code>is misaligned</code>. Outside it is misaligned.</p>');
  const [nodes] = collectGroups(document.querySelector("p"));
  rewriteGroup(nodes, document, "The model has a bug. Outside it has a bug.", diffEdits);
  assert.equal(document.querySelector("code").textContent, "is misaligned");
  assert.equal(document.querySelector("p").textContent, "The model is misaligned. Outside it has a bug.");
  const { html } = renderPage('<html><body><p>The federal agent <code>filed a report.</code> The AI is misaligned.</p></body></html>', "https://example.com/article");
  const rendered = parseHTML(html).document;
  assert.equal(rendered.querySelector("p").textContent, "The federal agent filed a report. The AI has a bug.");
  assert.equal(rendered.querySelector("code mark"), null);
});


test("page view preserves human attribution around quoted words across tags", () => {
  const { html } = renderPage('<html><body><p>The federal agent called the AI "<em>misaligned</em>" and warned it posed an existential risk. The AI is misaligned.</p></body></html>', "https://example.com/article");
  const { document } = parseHTML(html);
  assert.equal(document.querySelector("p").textContent, 'The federal agent called the AI "misaligned" and warned it posed an existential risk. The AI has a bug.');
  assert.equal(document.querySelectorAll("p mark").length, 1);
});


test("page Q elements supply implicit quotes without becoming edit targets", () => {
  const { html } = renderPage(`<html><body><p id="quote"><q>The federal agent</q> The AI is misaligned.</p><p id="outer">She said, 'The model <q>is misaligned</q>.' Outside it is misaligned.</p></body></html>`, "https://example.com/article");
  const { document } = parseHTML(html);
  assert.equal(document.querySelector("#quote").textContent, "The federal agent The AI has a bug.");
  assert.equal(document.querySelectorAll("q mark").length, 0);
  assert.equal(document.querySelector("#outer").textContent, "She said, 'The model is misaligned.' Outside it has a bug.");
  const [nodes] = collectGroups(document.querySelector("#quote"));
  assert.equal(groupStrings(nodes).original, "“The federal agent” The AI is misaligned.");
  rewriteGroup(nodes, document, "“The federal agent” The AI has a bug.", diffEdits);
  assert.equal(document.querySelector("q").textContent, "The federal agent");
  assert.equal(document.querySelector("#quote").textContent, "The federal agent The AI has a bug.");
});


test("page protected inline breaks preserve sentence and quote context", () => {
  const { html } = renderPage(`<html><body><p id="mixed">The federal agent <code>filed a report.<br></code>The AI is misaligned.</p><p id="speech">She said, 'The model <kbd>is<br>misaligned.</kbd>' Outside it is misaligned.</p></body></html>`, "https://example.com/article");
  const { document } = parseHTML(html);
  assert.match(document.querySelector("#mixed").textContent, /The AI has a bug/);
  assert.equal(document.querySelector("code mark"), null);
  assert.equal(document.querySelector("kbd mark"), null);
  assert.match(document.querySelector("#speech").textContent, /Outside it has a bug/);
  assert.equal(document.querySelectorAll("mark").length, 2);
});


test("hidden page content retains visibility state and supplies no rewrite context", () => {
  const { html } = renderPage(`<html><body><p id="mixed"><span hidden>The federal agent </span>The AI is misaligned.</p><p id="speech">She said, 'The model <code hidden>' Outside it is misaligned.</code>is misaligned.' Outside it is misaligned.</p><div hidden><p>The AI is misaligned.</p></div></body></html>`, "https://example.com/article");
  const { document } = parseHTML(html);
  assert.equal(document.querySelector("#mixed span").hasAttribute("hidden"), true);
  assert.equal(document.querySelector("#mixed span").textContent, "The federal agent ");
  assert.equal(document.querySelector("#mixed mark").textContent, "has a bug");
  assert.equal(document.querySelectorAll("[hidden] mark").length, 0);
  assert.equal(document.querySelector("#speech").querySelectorAll("mark").length, 1);
  assert.deepEqual(collectGroups(document.querySelector("div[hidden]")), []);
  assert.equal(document.querySelectorAll("mark").length, 2);
});

test("publisher layout, scoped attributes, fonts, SVG icons and mobile viewport survive page view", () => {
  const source = '<html><head><link rel="stylesheet" href="../theme.css" media="screen"><style>@font-face{font-family:News;src:url(../fonts/news.woff2)}:root{--brand:#2474bc}@media(min-width:768px){.story[data-astro-cid-news]{display:grid;grid-template-columns:2fr 1fr}}.story{color:var(--brand)}</style></head><body class="news"><astro-island data-astro-cid-news><article class="story" data-astro-cid-news style="max-width:1280px;margin:auto;padding:24px"><svg viewBox="0 0 24 24" width="24" height="24"><defs><path id="icon" d="M0 0h24v24z"/></defs><use xlink:href="#icon"/></svg><h1>The AI is misaligned.</h1><img src="logo.svg" width="270" height="44"></article></astro-island></body></html>';
  const { document } = parseHTML(renderPage(source, "https://example.com/news/story").html);
  assert.equal(document.querySelector("article").getAttribute("style"), "max-width:1280px;margin:auto;padding:24px");
  assert.equal(document.querySelector("link").getAttribute("media"), "screen");
  assert.equal(document.querySelector("link").getAttribute("href"), "/api/image?asset=1&url=" + encodeURIComponent("https://example.com/theme.css"));
  assert.ok(document.querySelector("astro-island[data-astro-cid-news]"));
  assert.ok(document.querySelector("article[data-astro-cid-news]"));
  assert.match(document.querySelector("style").textContent, /grid-template-columns:2fr 1fr/);
  assert.match(document.querySelector("style").textContent, /url\(\/api\/image\?asset=1&url=https%3A%2F%2Fexample.com%2Ffonts%2Fnews.woff2\)/);
  assert.equal(document.querySelector("svg").getAttribute("viewBox"), "0 0 24 24");
  assert.equal(document.querySelector("use").getAttribute("href"), "#icon");
  assert.equal(document.querySelector("img").getAttribute("width"), "270");
  assert.match(document.querySelector("img").getAttribute("src"), /^\/api\/image\?asset=1&url=/);
  assert.equal(document.querySelector('meta[name="viewport"]').getAttribute("content"), "width=device-width, initial-scale=1");
  assert.doesNotMatch(document.querySelector("#dedoomify-style").textContent, /body\s*\{|max-width:960px/);
  assert.equal(document.querySelector("h1 mark.dd").textContent, "has a bug");
});

test("pop-ups that wait for a script to open them are dropped, not shown over the article", () => {
  const source = `<html><body>
<dialog id="d"><p>Get Started. The AI is misaligned.</p></dialog>
<div popover id="p">Start typing to search</div>
<div role="dialog" id="r"><p>Create Account</p></div>
<div role="AlertDialog" id="a">Cookies</div>
<div aria-modal="true" id="m">Sign up with LinkedIn</div>
<div x-cloak id="x"><p>Subscribe to our newsletter</p></div>
<div v-cloak id="v"><main><h1>Title</h1><p>The model is misaligned.</p></main></div>
<div role="dialog" id="kept"><article><p>Body</p></article></div>
<article><p>The model is misaligned.</p></article>
</body></html>`;
  const { document } = parseHTML(renderPage(source, "https://example.com/").html);
  for (const id of ["d", "p", "r", "a", "m", "x"]) assert.equal(document.getElementById(id), null, id);
  assert.doesNotMatch(document.body.textContent, /Get Started|Start typing|Create Account|Cookies|LinkedIn|newsletter/);
  assert.ok(document.getElementById("v"));
  assert.ok(document.getElementById("kept"));
  // An app root cloaked until its framework starts is the page, not a pop-up.
  for (const root of [`<body ng-cloak><div><h1>Title</h1><p>The model is misaligned.</p></div></body>`, `<body><div id="app" v-cloak><h1>Title</h1><p>The model is misaligned.</p></div><div x-cloak>Menu</div></body>`]) {
    const page = parseHTML(renderPage(`<html>${root}</html>`, "https://example.com/").html).document;
    assert.equal(page.querySelectorAll("h1").length, 1);
    assert.equal(page.querySelectorAll("mark.dd").length, 1);
    assert.doesNotMatch(page.body.textContent, /Menu/);
  }
  assert.equal(document.querySelectorAll("body > article mark.dd").length, 1);
});
