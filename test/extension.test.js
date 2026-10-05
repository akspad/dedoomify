import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import "../shared/dedoom-core.js";
import "../extension/dedoomify-page.js";

const ext = (p) => new URL(`../extension/${p}`, import.meta.url);
const manifest = JSON.parse(fs.readFileSync(ext("manifest.json"), "utf8"));

test("the manifest meets the stores' basic rules", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
  assert.ok(manifest.name.length <= 45, "name is 45 characters at most");
  assert.ok(manifest.description.length <= 132, "description is 132 characters at most");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting"]);
  assert.equal(manifest.host_permissions, undefined, "site access is optional, asked for only by the automatic setting");
  assert.deepEqual(manifest.optional_host_permissions, ["<all_urls>"]);
});

test("every file the extension refers to exists", () => {
  const files = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  const popup = fs.readFileSync(ext("popup.html"), "utf8");
  for (const [, src] of popup.matchAll(/(?:src|href)="([^":]+)"/g)) files.push(src);
  for (const name of ["popup.js", "background.js"]) {
    const script = fs.readFileSync(ext(name), "utf8");
    for (const [, file] of script.matchAll(/"([\w-]+\.(?:js|css))"/g)) files.push(file);
  }
  for (const file of files) assert.ok(fs.existsSync(ext(file)), `${file} is in extension/`);
});

test("the extension loads no remote code", () => {
  for (const file of fs.readdirSync(ext(""))) {
    if (!/\.(js|html)$/.test(file)) continue;
    const source = fs.readFileSync(ext(file), "utf8");
    assert.doesNotMatch(source, /<script[^>]+src="https?:/, file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|importScripts\(/, file);
  }
});

const { looksDoomy } = globalThis.DedoomifyPage;

function extensionPage(html, computedStyle) {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  window.getComputedStyle = computedStyle || ((node) => {
    let visibility = "";
    for (let ancestor = node; ancestor && !visibility; ancestor = ancestor.parentElement) visibility = ancestor.style.visibility;
    return { display: node.style.display, visibility, contentVisibility: node.style.contentVisibility };
  });
  // Linkedom omits TreeWalker's filter argument; supply its browser behavior.
  const walk = document.createTreeWalker.bind(document);
  document.createTreeWalker = (root, mask, filter) => {
    const walker = walk(root, mask);
    return { currentNode: null, nextNode() {
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (filter.acceptNode(node) === 1) { this.currentNode = node; return node; }
      }
      return null;
    } };
  };
  const context = vm.createContext({ document, window, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 }, Dedoom: globalThis.Dedoom });
  vm.runInContext(fs.readFileSync(ext("dedoomify-page.js"), "utf8"), context);
  return { document, run: () => context.DedoomifyPage.run() };
}

test("extension preserves speech across inline formatting and rewrites outside it", () => {
  for (const [open, close] of [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"]]) {
    const { document, run } = extensionPage(`<p>She said, ${open}The model <em>is misaligned</em>.${close} Outside it is misaligned.</p>`);
    assert.equal(run().added, 1);
    assert.equal(document.querySelector("em").textContent, "is misaligned");
    assert.match(document.querySelector("p").textContent, /Outside it has a bug/);
    assert.equal(run().added, 0, "running twice does not rewrite existing marks");
    assert.equal(document.querySelectorAll("mark.dedoomify").length, 1);
  }
});

test("extension keeps human roles across nodes and skips quoted/code/editable content", () => {
  const { document, run } = extensionPage('<p>The <em>federal agents</em> blackmailed the witness while discussing AI.</p><p>The model is misaligned.</p><blockquote>The model is misaligned.</blockquote><q>The model is misaligned.</q><pre>The model is misaligned.</pre><p contenteditable="true">The model is misaligned.</p>');
  assert.equal(run().added, 1);
  assert.equal(document.querySelector("p").textContent, "The federal agents blackmailed the witness while discussing AI.");
  for (const selector of ["blockquote", "q", "pre", "[contenteditable]"]) {
    assert.equal(document.querySelector(selector).textContent, "The model is misaligned.");
    assert.equal(document.querySelector(selector).querySelector("mark"), null);
  }
});

test("extension retains whitespace separators in paragraph protection", () => {
  const { document, run } = extensionPage('<p id="human">The <em>federal agent</em> <span>warned of an existential risk.</span></p><p id="speech">She <b>said,</b> <span>\'The model is misaligned.\'</span> Outside it is misaligned.</p>');
  assert.equal(run().added, 1);
  assert.equal(document.querySelector("#human").textContent, "The federal agent warned of an existential risk.");
  assert.equal(document.querySelector("#human mark"), null);
  assert.equal(document.querySelector("#speech span").textContent, "'The model is misaligned.'");
  assert.match(document.querySelector("#speech").textContent, /Outside it has a bug/);
});

test("extension maps rendered line breaks without corrupting protection offsets", () => {
  const { document, run } = extensionPage('<p id="mixed">The federal agent filed a report.<br>The AI is misaligned.</p><p id="speech">She said, \'The model<br><em>is misaligned.</em>\' Outside it is misaligned.</p><p id="human">The <em>federal</em><br><span>agent blackmailed the witness.</span></p>');
  assert.equal(run().added, 2);
  assert.match(document.querySelector("#mixed").textContent, /The AI has a bug/);
  assert.equal(document.querySelector("#speech em").textContent, "is misaligned.");
  assert.match(document.querySelector("#speech").textContent, /Outside it has a bug/);
  assert.equal(document.querySelector("#human mark"), null);
  assert.equal(document.querySelectorAll("br").length, 3);
});

test("extension separates definition lists and every rendered block run", () => {
  for (const html of [
    '<dl><dt>The federal agent</dt>\n<dd id="ai">The AI is misaligned.</dd></dl>',
    '<fieldset><legend>The federal agent</legend><div id="ai">The AI is misaligned.</div></fieldset>',
    '<article><header>The federal agent</header><footer id="ai">The AI is misaligned.</footer></article>',
    '<div>The federal agent<aside>Filed a report</aside><span id="ai">The AI is misaligned.</span></div>',
    '<div>The federal agent<hr><span id="ai">The AI is misaligned.</span></div>',
  ]) {
    const { document, run } = extensionPage(html);
    assert.equal(run().added, 1, html);
    assert.equal(document.querySelector("#ai").textContent, "The AI has a bug.", html);
    assert.equal(run().added, 0);
  }
});

test("extension retains skipped inline text as immutable sentence and quote context", () => {
  for (const tag of ["code", "kbd", "samp", "q", "span contenteditable=true"]) {
    const close = tag.split(" ")[0];
    const { document, run } = extensionPage(`<p id="mixed">The federal agent <${tag}>filed a report.</${close}> The AI is misaligned.</p><p id="speech">She said, 'The model <${tag}>is</${close}> misaligned.' Outside it is misaligned.</p>`);
    assert.equal(run().added, 2, tag);
    assert.match(document.querySelector("#mixed").textContent, /The AI has a bug/);
    assert.equal(document.querySelector(`#mixed ${close}`).textContent, "filed a report.");
    assert.equal(document.querySelector(`#speech ${close}`).textContent, "is");
    assert.match(document.querySelector("#speech").textContent, /The model is misaligned.' Outside it has a bug/);
    assert.equal(run().added, 0);
  }
});

test("extension excludes hidden subtrees from visible protection and rewriting", () => {
  const { document, run } = extensionPage(`<p id="human"><span hidden>The federal agent </span>The AI is misaligned.</p><p id="code"><code hidden>The federal agent is misaligned.</code>The AI is misaligned.</p><p id="quote">She said, 'The model <span hidden>' Outside it is misaligned.</span><em>is misaligned.</em>' Outside it is misaligned.</p><section hidden><p>The AI is misaligned.</p></section>`);
  assert.equal(run().added, 3);
  assert.equal(document.querySelector("#human span").textContent, "The federal agent ");
  assert.equal(document.querySelector("#code code").textContent, "The federal agent is misaligned.");
  assert.equal(document.querySelector("#quote em").textContent, "is misaligned.");
  for (const element of document.querySelectorAll("[hidden]")) assert.equal(element.querySelector("mark"), null);
  assert.equal(run().added, 0);
});

test("extension excludes CSS-hidden context and respects visible overrides", () => {
  const { document, run } = extensionPage(`<style>.concealed{display:none}</style><p id="inline"><span style="display:none">The federal agent </span>The AI is misaligned.</p><p id="class"><span class="concealed">The federal agent </span>The AI is misaligned.</p><p id="visibility"><span style="visibility:hidden">The federal agent </span>The AI is misaligned.</p><p id="override" style="visibility:hidden"><span style="visibility:visible">The AI is misaligned.</span></p><p id="code">She said, 'The model <code><span class="concealed">'</span>is</code> misaligned.' Outside it is misaligned.</p>`, (node) => {
    let visibility = "";
    for (let ancestor = node; ancestor && !visibility; ancestor = ancestor.parentElement) visibility = ancestor.style.visibility;
    return { display: node.classList.contains("concealed") ? "none" : node.style.display, visibility, contentVisibility: node.style.contentVisibility };
  });
  assert.equal(run().added, 5);
  for (const selector of ["#inline span", "#class span", "#visibility span", "#code code"]) assert.equal(document.querySelector(selector).querySelector("mark"), null);
  assert.equal(document.querySelector("#override span").textContent, "The AI has a bug.");
  assert.match(document.querySelector("#code").textContent, /misaligned.' Outside it has a bug/);
  assert.equal(run().added, 0);
});

test("extension preserves quotes across computed blocks and rewrites independent AI claims", () => {
  for (const display of ["block", "flex", "grid", "flow-root", "list-item"]) {
    const { document, run } = extensionPage(`<div id="mixed">The federal agent<span style="display:${display}">filed a report</span>The AI is misaligned.</div><p id="bare">The federal agent<br>The AI is misaligned.</p><p id="continuation">The federal agent<br>is misaligned.</p><p id="quote">She said, 'The model <span style="display:${display}">is misaligned</span>.' Outside it is misaligned.</p>`);
    assert.equal(run().added, 3, display);
    assert.match(document.querySelector("#mixed").textContent, /The AI has a bug/);
    assert.match(document.querySelector("#bare").textContent, /The AI has a bug/);
    assert.equal(document.querySelector("#continuation mark"), null);
    assert.equal(document.querySelector("#quote span").textContent, "is misaligned");
    assert.match(document.querySelector("#quote").textContent, /Outside it has a bug/);
    assert.equal(run().added, 0);
  }
});

test("automatic mode picks out articles with AI doom", () => {
  assert.ok(looksDoomy("Experts warn a rogue AI could wipe out humanity."));
  assert.ok(looksDoomy("The chatbot is misaligned, researchers say."));
  assert.ok(looksDoomy("What's your p(doom)? Superintelligence is coming, says OpenAI."));
  assert.ok(looksDoomy("In a test, the AI blackmailed the engineer."));
});

test("automatic mode leaves other pages alone", () => {
  assert.ok(!looksDoomy("Our new AI assistant helps you write emails faster."), "AI without doom");
  assert.ok(!looksDoomy("The asteroid could cause the extinction of the dinosaurs' rivals."), "doom words without AI");
  assert.ok(!looksDoomy("Said the maid: the rain in Spain is plain doom for picnics."), "lowercase 'ai' inside words isn't AI");
  assert.ok(!looksDoomy(""));
});

test("automatic mode judges a long page quickly", () => {
  const filler = "The quarterly report shows steady growth in the widget market across regions. ".repeat(400);
  const start = performance.now();
  for (let i = 0; i < 100; i++) looksDoomy(filler);
  const perPage = (performance.now() - start) / 100;
  assert.ok(perPage < 5, `took ${perPage.toFixed(2)} ms per page`);
});


test("extension retains human actor context around split quoted wording", () => {
  const { document, run } = extensionPage('<p id="human">The <em>federal agent</em> called the AI "<b>misaligned</b>" and warned it posed <span>an existential risk.</span></p><p>The AI is misaligned.</p>');
  assert.equal(run().added, 1);
  assert.equal(document.querySelector("#human mark"), null);
  assert.equal(document.querySelector("#human").textContent, 'The federal agent called the AI "misaligned" and warned it posed an existential risk.');
});


test("semantic inline quotes do not leak human context to neighboring AI claims", () => {
  const { document, run } = extensionPage(`<p id="quote"><q>The federal agent</q> The AI is misaligned.</p><p id="outer">She said, 'The model <q>is misaligned</q>.' Outside it is misaligned.</p>`);
  assert.equal(run().added, 2);
  assert.equal(document.querySelector("#quote").textContent, "The federal agent The AI has a bug.");
  assert.equal(document.querySelectorAll("q mark").length, 0);
  assert.equal(document.querySelector("#outer").textContent, "She said, 'The model is misaligned.' Outside it has a bug.");
});


test("extension detection recognizes dotted and hyphenated AI qualifiers", () => {
  assert.ok(looksDoomy("The A.I. personal assistant is misaligned."));
  for (const suffix of ["powered", "driven", "based", "enabled", "controlled"]) {
    assert.ok(looksDoomy(`The A.I.-${suffix} personal assistant is misaligned.`));
    const { document, run } = extensionPage(`<p>The A.I.-${suffix} personal assistant is misaligned.</p>`);
    assert.equal(run().added, 1);
    assert.match(document.body.textContent, /has a bug/);
  }
  assert.ok(!looksDoomy("A.I.-powered software helps with email."));
  assert.ok(!looksDoomy("The A.I.-powerful personal assistant is misaligned."));
  assert.ok(!looksDoomy("The a.i.-powered personal assistant is misaligned."));
  assert.ok(looksDoomy("The artificial-intelligence-powered personal assistant is misaligned."));
  const { document, run } = extensionPage('<p>The A.I. personal assistant is misaligned.</p><p>The artificial-intelligence-powered personal assistant is misaligned.</p>');
  assert.equal(run().added, 2);
  assert.equal(document.querySelectorAll("mark").length, 2);
});


test("protected inline subtrees retain rendered breaks as immutable context", () => {
  for (const content of ["filed a report.<br>", '<span style="display:block">filed a report.</span>']) {
    const { document, run } = extensionPage(`<p id="mixed">The federal agent <code>${content}</code>The AI is misaligned.</p><p id="speech">She said, 'The model <kbd>is<br>misaligned.</kbd>' Outside it is misaligned.</p>`);
    assert.equal(run().added, 2);
    assert.match(document.querySelector("#mixed").textContent, /The AI has a bug/);
    assert.equal(document.querySelector("code mark"), null);
    assert.equal(document.querySelector("kbd mark"), null);
    assert.match(document.querySelector("#speech").textContent, /Outside it has a bug/);
  }
});

test("iframe fallback text never supplies visible context or rewrite targets", () => {
  const { document, run } = extensionPage(`<p><iframe>The federal agent</iframe>The AI is misaligned.</p><p><code><iframe>The federal agent</iframe></code>The AI is misaligned.</p><p>She said, 'The model <kbd><iframe>' Outside it is misaligned.</iframe>is</kbd> misaligned.' Outside it is misaligned.</p>`);
  assert.equal(run().added, 3);
  assert.equal(document.querySelectorAll("iframe mark").length, 0);
  assert.equal(document.querySelectorAll("kbd mark").length, 0);
  assert.equal(document.querySelectorAll("mark").length, 3);
  assert.equal(run().added, 0);
});
