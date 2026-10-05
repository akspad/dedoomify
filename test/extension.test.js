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

function extensionPage(html) {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
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
  const context = vm.createContext({ document, window, NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }, Dedoom: globalThis.Dedoom });
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
