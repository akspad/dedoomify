import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import "../shared/dedoom-core.js";
import "../shared/dedoom-prompt.js";
import "../shared/page-dedoom.js";
import "../public/diff.js";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = (text) => ({ ok: true, json: async () => ({ title: "Your text", engine: "rules", blocks: [{ original: text, text: globalThis.Dedoom.dedoomText(text), type: "paragraph" }] }) });

// Run the actual app against its real HTML, with controlled browser services
// and network responses. This exercises event wiring and async recovery rather
// than reproducing the app's implementation in a test helper.
async function browser(fetch, localAi = {}) {
  const { document, Event } = parseHTML(html);
  const context = {
    document, console, URLSearchParams, fetch,
    matchMedia: () => ({ matches: false }), navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    location: { origin: "https://dedoomify.com", href: "https://dedoomify.com/", search: "" },
    history: { replaceState() {} },
    ResizeObserver: class { observe() {} },
    addEventListener() {}, scrollTo() {}, innerHeight: 700, scrollY: 0,
    localAi: { isSupported: async () => false, ...localAi },
    tooltip: { attach() {}, hide() {} },
    Dedoom: globalThis.Dedoom, DedoomPrompt: globalThis.DedoomPrompt,
    DedoomPage: globalThis.DedoomPage, DedoomDiff: globalThis.DedoomDiff,
  };
  context.window = context;
  document.querySelector("video").pause = () => {};
  document.querySelector("#result").scrollIntoView = () => {};
  document.querySelector("#result").getBoundingClientRect = () => ({ top: 0 });
  vm.createContext(context);
  vm.runInContext(app.replace(/^import .*;$/gm, ""), context);
  await tick();
  const $ = (id) => document.getElementById(id);
  const event = (id, type, props = {}) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, props);
    $(id).dispatchEvent(e);
  };
  const paste = (text) => { event("tab-text", "click"); $("text").value = text; event("form", "submit"); };
  return { $, document, event, paste };
}

test("source tabs support arrow, Home and End keys with one tab stop", async () => {
  const { $, event } = await browser(() => { throw new Error("unexpected fetch"); });
  for (const [key, selected] of [["ArrowRight", "text"], ["ArrowLeft", "url"], ["End", "text"], ["Home", "url"]]) {
    event("tab-url", "keydown", { key });
    assert.equal($("tab-" + selected).getAttribute("aria-selected"), "true");
    assert.equal($("tab-" + selected).getAttribute("tabindex"), "0");
    assert.equal($("tab-" + (selected === "text" ? "url" : "text")).getAttribute("tabindex"), "-1");
    assert.equal($("panel-" + selected).hidden, false);
  }
});

test("empty text stays editable and pasted markup is rendered as text", async () => {
  let calls = 0;
  const { $, paste } = await browser(async (_url, options) => { calls++; return response(JSON.parse(options.body).text); });
  paste("  ");
  assert.equal(calls, 0);
  assert.match($("error").textContent, /Paste some text/);
  const text = "The model is misaligned. She said, 'The model is misaligned.' <img src=x onerror=alert(1)>";
  paste(text);
  await tick();
  assert.equal(calls, 1);
  assert.equal($("go").disabled, false);
  assert.equal($("article").querySelector("img"), null);
  assert.match($("article").textContent, /The model has a bug/);
  assert.match($("article").textContent, /'The model is misaligned\.'/);
});

test("network and quota errors recover without leaving submit disabled", async () => {
  const responses = [
    () => { throw new TypeError("Failed to fetch"); },
    () => ({ ok: false, json: async () => ({ error: "Too many requests. Please try again in a minute." }) }),
    () => response("The model is misaligned."),
  ];
  const { $, paste } = await browser(async () => responses.shift()());
  for (let i = 0; i < 3; i++) {
    paste("The model is misaligned.");
    await tick();
    assert.equal($("go").disabled, false);
    assert.equal($("result").hidden, i < 2);
    assert.equal($("error").hidden, i === 2);
  }
  assert.match($("article").textContent, /has a bug/);
});

test("a late response cannot overwrite a newer reader result", async () => {
  let finishOld;
  let calls = 0;
  const { $, paste } = await browser(() => ++calls === 1 ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve(response("The new model is misaligned.")));
  paste("The old model is misaligned.");
  paste("The new model is misaligned.");
  await tick();
  finishOld(response("The old model is misaligned."));
  await tick();
  assert.match($("article").textContent, /new model has a bug/);
  assert.doesNotMatch($("article").textContent, /old model/);
});
