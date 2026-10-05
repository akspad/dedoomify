import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const source = (name) => fs.readFileSync(new URL(`../extension/${name}`, import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const eventBus = () => {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, async emit() { for (const fn of listeners) await fn(); } };
};

function harness(html = "<p>The model is misaligned.</p>", url = "https://example.com/article?x=1&y=2") {
  const page = parseHTML(`<html><head><title>AI news</title></head><body>${html}</body></html>`);
  page.window.getComputedStyle = (node) => ({ display: node.style.display, visibility: node.style.visibility, contentVisibility: node.style.contentVisibility });
  const walk = page.document.createTreeWalker.bind(page.document);
  page.document.createTreeWalker = (root, mask, filter) => {
    const walker = walk(root, mask);
    return { currentNode: null, nextNode() {
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (filter.acceptNode(node) === 1) { this.currentNode = node; return node; }
      }
      return null;
    } };
  };
  const pageContext = vm.createContext({ document: page.document, window: page.window,
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    setTimeout() {} });
  const popup = parseHTML(source("popup.html"));
  const registered = new Map(), css = [];
  let granted = false;
  const chrome = {
    permissions: {
      onAdded: eventBus(), onRemoved: eventBus(),
      async contains() { return granted; },
      async request() { granted = true; await this.onAdded.emit(); return true; },
      async remove() { granted = false; await this.onRemoved.emit(); return true; },
    },
    runtime: { onInstalled: eventBus(), onStartup: eventBus() },
    tabs: { async query() { return [{ id: 7, url }]; } },
    scripting: {
      async insertCSS(request) { css.push(...request.files); },
      async executeScript(request) {
        if (request.files) return request.files.map((file) => ({ result: vm.runInContext(source(file), pageContext) }));
        pageContext.args = request.args || [];
        return [{ result: vm.runInContext(`(${request.func.toString()})(...args)`, pageContext) }];
      },
      async getRegisteredContentScripts() { return [...registered.values()]; },
      async registerContentScripts(scripts) { for (const script of scripts) registered.set(script.id, script); },
      async unregisterContentScripts({ ids }) { for (const id of ids) registered.delete(id); },
    },
  };
  vm.runInContext(source("background.js"), vm.createContext({ chrome, console }));
  vm.runInContext(source("popup.js"), vm.createContext({ chrome, document: popup.document }));
  const control = (id) => popup.document.getElementById(id);
  return { page, pageContext, popup, chrome, css, registered, control,
    async click(id) { control(id).dispatchEvent(new popup.window.Event("click")); await flush(); },
    async toggle(id, checked) { control(id).checked = checked; control(id).dispatchEvent(new popup.window.Event("change")); await flush(); },
  };
}

test("popup opens the same article with the on-device engine selected", async () => {
  const h = harness();
  await flush();
  const link = new URL(h.control("site").getAttribute("href"));
  assert.equal(link.origin, "https://dedoomify.com");
  assert.equal(link.searchParams.get("url"), "https://example.com/article?x=1&y=2");
  assert.equal(link.searchParams.get("mode"), "local");
  const restricted = harness("", "chrome://settings/");
  await flush();
  assert.equal(new URL(restricted.control("site").getAttribute("href")).searchParams.get("mode"), "local");
  assert.equal(new URL(restricted.control("site").getAttribute("href")).searchParams.has("url"), false);
});

test("popup rewrites, toggles highlights and restores the exact original text", async () => {
  const h = harness('<p>The model <em>is misaligned</em>.</p><blockquote>The model is misaligned.</blockquote>');
  const original = h.page.document.body.textContent;
  await flush();
  await h.click("run");
  assert.equal(h.page.document.querySelectorAll("mark.dedoomify").length, 1);
  assert.match(h.page.document.querySelector("p").textContent, /has a bug/);
  assert.equal(h.page.document.querySelector("blockquote").textContent, "The model is misaligned.");
  assert.match(h.control("summary").textContent, /Rewrote 1 phrase/);
  assert.equal(h.control("result").hidden, false);
  assert.equal(h.control("run").disabled, false);
  assert.ok(h.css.includes("content.css"));
  await h.toggle("show", false);
  assert.equal(h.page.document.documentElement.classList.contains("dedoomify-show"), false);
  assert.equal(h.page.document.querySelectorAll("mark.dedoomify").length, 1);
  await h.toggle("show", true);
  assert.equal(h.page.document.documentElement.classList.contains("dedoomify-show"), true);
  await h.click("undo");
  assert.equal(h.page.document.body.textContent, original);
  assert.equal(h.page.document.querySelectorAll("mark.dedoomify").length, 0);
  assert.equal(h.control("result").hidden, true);
  assert.equal(h.control("run").hidden, false);
  assert.equal(h.control("status").textContent, "Restored the original text.");
});

test("automatic mode registers only after opt-in and unregisters after revocation", async () => {
  const h = harness();
  await flush();
  await h.chrome.runtime.onInstalled.emit();
  assert.equal(h.registered.size, 0);
  await h.toggle("auto", true);
  assert.equal(h.control("auto").checked, true);
  const script = h.registered.get("dedoomify-auto");
  assert.ok(script);
  assert.deepEqual(Array.from(script.js), ["dedoom-core.js", "dedoomify-page.js", "auto.js"]);
  assert.ok(script.excludeMatches.includes("*://dedoomify.com/*"));
  await h.toggle("auto", false);
  assert.equal(h.registered.size, 0);
  assert.equal(h.control("auto").checked, false);
});

test("automatic script rewrites AI doom, skips ordinary pages and is idempotent", async () => {
  for (const [html, count] of [["<p>The AI is misaligned.</p>", 1], ["<p>Our AI assistant helps with email.</p>", 0]]) {
    const h = harness(html);
    await flush();
    vm.runInContext(source("dedoom-core.js"), h.pageContext);
    vm.runInContext(source("dedoomify-page.js"), h.pageContext);
    // Chrome's isolated world exposes script globals on window.
    h.page.window.DedoomifyPage = h.pageContext.DedoomifyPage;
    vm.runInContext(source("auto.js"), h.pageContext);
    assert.equal(h.page.document.querySelectorAll("mark.dedoomify").length, count);
    vm.runInContext(source("auto.js"), h.pageContext);
    assert.equal(h.page.document.querySelectorAll("mark.dedoomify").length, count);
  }
});
