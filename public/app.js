import * as localAi from "./local-ai.js";
import * as tooltip from "./tooltip.js";

const $ = (id) => document.getElementById(id);
const form = $("form"), go = $("go"), errorEl = $("error");
const result = $("result"), articleEl = $("article"), notice = $("notice");
const frame = $("page"), banner = $("banner"), summary = $("summary");
const viewToggle = $("view-toggle"), originalLink = $("original-link");
const modeSelect = $("mode");
const tabUrl = $("tab-url"), tabText = $("tab-text");
const panelUrl = $("panel-url"), panelText = $("panel-text");
const { dedoomText } = globalThis.Dedoom;
const { STYLE_GUIDE } = globalThis.DedoomPrompt;
const { collectGroups, groupStrings, normalize, rewriteGroup } = globalThis.DedoomPage;
const { diffEdits } = globalThis.DedoomDiff;

let activeTab = "url";
let lastShare = null;
let runCounter = 0;
// What's showing: a link as the original "page" or in "reader" view, or
// pasted text (always reader view).
let source = null; // { url } or { text }
let view = "page";

function selectTab(which) {
  activeTab = which;
  tabUrl.setAttribute("aria-selected", String(which === "url"));
  tabText.setAttribute("aria-selected", String(which === "text"));
  panelUrl.hidden = which !== "url";
  panelText.hidden = which !== "text";
}
tabUrl.addEventListener("click", () => selectTab("url"));
tabText.addEventListener("click", () => selectTab("text"));

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function showNotice(message) {
  notice.textContent = message || "";
  notice.hidden = !message;
}

function setSummary(text) {
  summary.textContent = text;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const c of children || []) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Which on-device model each "Rewrite with" option uses.
const LOCAL_MODES = { local: "qwen", "local-small": "smol" };
const localModelKey = () => LOCAL_MODES[modeSelect.value];

// Keep the frame filling the screen below the sticky banner.
new ResizeObserver(() => {
  result.style.setProperty("--banner-h", `${banner.offsetHeight}px`);
}).observe(banner);

// ---- Reader view: the article's text only ----

function renderSegments(parent, original, rewritten) {
  for (const seg of DedoomDiff.diffSegments(original, rewritten)) {
    if (seg.original === undefined) {
      parent.appendChild(document.createTextNode(seg.text));
    } else if (seg.text) {
      parent.appendChild(el("mark", { class: "dd", "data-was": seg.original }, [seg.text]));
    } else if (seg.original) {
      parent.appendChild(el("del", { class: "dd", "data-was": seg.original }, [seg.original]));
    }
  }
}

const TAGS = { heading: "h2", paragraph: "p", item: "li", quote: "blockquote" };

// A block renders as its text plus a hidden "Original:" line for the toggle.
function blockNodes(block) {
  const node = el(TAGS[block.type] || "p", {}, []);
  renderSegments(node, block.original, block.text);
  const nodes = [node];
  if (block.original !== block.text) nodes.push(el("p", { class: "original" }, ["Original: " + block.original]));
  return nodes;
}

function readerSummary(data) {
  const changed = data.blocks.filter((b) => b.text !== b.original).length;
  return `${changed} of ${plural(data.blocks.length, "paragraph")} changed`;
}

function renderReader(data) {
  articleEl.textContent = "";
  const h1 = el("h1", {}, []);
  renderSegments(h1, data.originalTitle || data.title, data.title);
  articleEl.appendChild(h1);
  const parts = [data.siteName, data.byline].filter(Boolean);
  if (parts.length) articleEl.appendChild(el("p", { class: "meta" }, [parts.join(" · ")]));
  const nodes = data.blocks.map((block) => {
    const group = blockNodes(block);
    group.forEach((n) => articleEl.appendChild(n));
    return group;
  });
  if (!data.blocks.some((b) => b.text !== b.original) && data.engine !== "local") {
    articleEl.appendChild(el("p", { class: "empty" }, ["Good news: we didn't find any doom to remove."]));
  }
  setSummary(readerSummary(data));
  showNotice(data.notice);
  return { data, nodes };
}

function updateBlock(readerView, i, text) {
  const block = readerView.data.blocks[i];
  block.text = text;
  const fresh = blockNodes(block);
  const old = readerView.nodes[i];
  old[0].replaceWith(...fresh);
  old.slice(1).forEach((n) => n.remove());
  readerView.nodes[i] = fresh;
  setSummary(readerSummary(readerView.data));
}

// ---- Page view: the original page with changes marked in place ----

function pageSummary(doc, engine) {
  const n = doc.querySelectorAll("mark.dd, del.dd").length;
  if (n === 0 && engine === "rules") return "No doom phrases found on this page";
  return `${plural(n, "doom phrase")} changed`;
}

// Resolves with the frame's new document once it has been parsed, without
// waiting for every image to load.
function loadFrame(src, runId) {
  const old = frame.contentDocument;
  frame.src = src;
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      let doc = null;
      try { doc = frame.contentDocument; } catch {}
      const ready = doc && doc !== old && doc.location.pathname === "/api/page" && doc.readyState !== "loading" && doc.body;
      if (runId !== runCounter || ready || Date.now() - started > 45_000) {
        clearInterval(timer);
        resolve(runId === runCounter && ready ? doc : null);
      }
    }, 50);
  });
}

async function showPage(url, runId) {
  setSummary("Loading the page…");
  const doc = await loadFrame("/api/page?url=" + encodeURIComponent(url), runId);
  if (runId !== runCounter) return;
  if (!doc) throw new Error("That page took too long to load. Try reader view.");
  const failed = doc.querySelector('meta[name="dedoomify-error"]');
  if (failed) throw new Error(failed.getAttribute("content"));
  applyHighlight();
  setSummary(pageSummary(doc, "rules"));
  if (localModelKey()) await rewritePageLocally(doc, runId);
}

// ---- On-device model ----

// Rewrites each item's `original` with the on-device model, calling
// apply(item, text) as each one finishes. Items the model gets wrong keep the
// phrase-rules version. The notice line shows progress and clears when done,
// so the banner stays one line. Returns whether the model loaded.
async function rewriteWithModel(items, runId, apply, what) {
  const stale = () => runId !== runCounter;
  if (items.length === 0) {
    showNotice("");
    return false;
  }
  const key = localModelKey();
  const model = localAi.MODELS[key];
  let engine;
  try {
    showNotice("Loading the on-device model…");
    engine = await localAi.loadEngine(key, (report) => {
      if (stale()) return;
      const pct = Math.round((report.progress || 0) * 100);
      showNotice(`Loading ${model.label} on your device: ${pct}%. This is a one-time download of ${model.size}; next time it loads from your browser's cache.`);
    });
  } catch (err) {
    console.error(err);
    if (!stale()) showNotice("The on-device model couldn't load in this browser, so this uses the quick phrase rules.");
    return false;
  }
  let done = 0;
  for (const item of items) {
    if (stale()) return true;
    showNotice(`Rewriting on your device: ${done} of ${plural(items.length, what)} done.`);
    try {
      const output = await localAi.rewriteParagraph(engine, STYLE_GUIDE, item.original);
      if (stale()) return true;
      if (localAi.acceptRewrite(item.original, output)) {
        // The rules catch anything the model left behind.
        apply(item, dedoomText(output));
      }
    } catch (err) {
      console.error(err);
    }
    done++;
  }
  showNotice("");
  return true;
}

function rewriteReaderLocally(readerView, runId) {
  const { data } = readerView;
  const items = [{ index: -1, original: data.originalTitle || data.title, current: data.title }]
    .concat(data.blocks.map((b, index) => ({ index, original: b.original, current: b.text })))
    .filter((item) => localAi.needsModel(item.original, item.current));
  return rewriteWithModel(items, runId, (item, text) => {
    data.engine = "local";
    if (item.index === -1) {
      data.title = text;
      const h1 = articleEl.querySelector("h1");
      h1.textContent = "";
      renderSegments(h1, item.original, text);
    } else {
      updateBlock(readerView, item.index, text);
    }
  }, "paragraph");
}

// Pages can be long, so only the first paragraphs with doom framing go to the model.
const MAX_MODEL_GROUPS = 60;

async function rewritePageLocally(doc, runId) {
  const items = collectGroups(doc.body)
    .map((nodes) => {
      const { original, current } = groupStrings(nodes);
      return { nodes, original: normalize(original).text, current: normalize(current).text };
    })
    .filter((g) => g.original.length >= 20 && g.original.length <= 2000 && localAi.needsModel(g.original, g.current))
    .slice(0, MAX_MODEL_GROUPS);
  const loaded = await rewriteWithModel(items, runId, (item, text) => {
    if (text !== item.current) rewriteGroup(item.nodes, doc, text, diffEdits);
    setSummary(pageSummary(doc, "local"));
  }, "paragraph");
  if (loaded && runId === runCounter) setSummary(pageSummary(doc, "local"));
}

// ---- Controls ----

function applyHighlight() {
  const on = $("show-changes").checked;
  articleEl.classList.toggle("show-changes", on);
  articleEl.classList.toggle("show-original", $("show-original").checked);
  const pageRoot = frame.contentDocument?.documentElement;
  pageRoot?.classList.toggle("dd-off", !on);
  // The frame draws its own hover card (see lib/page.js); hide it too.
  pageRoot?.querySelector("#dd-tip")?.setAttribute("hidden", "");
  tooltip.hide();
}
$("show-changes").addEventListener("change", applyHighlight);
$("show-original").addEventListener("change", applyHighlight);
tooltip.attach(document, { enabled: () => articleEl.classList.contains("show-changes") });

$("share").addEventListener("click", function () {
  const link = lastShare || location.href;
  const btn = this;
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
    .then(() => { btn.textContent = "Link copied"; })
    .catch(() => { prompt("Copy this link:", link); })
    .then(() => setTimeout(() => { btn.textContent = "Copy share link"; }, 2000));
});

viewToggle.addEventListener("click", () => {
  view = view === "page" ? "reader" : "page";
  start();
});

function setBusy(busy) {
  go.disabled = busy;
  go.textContent = busy ? "De-dooming…" : "De-doom it";
}

function layout() {
  const page = view === "page";
  result.classList.toggle("page-view", page);
  frame.hidden = !page;
  articleEl.hidden = page;
  $("show-original-wrap").hidden = page;
  viewToggle.hidden = !source.url;
  viewToggle.textContent = page ? "Reader view" : "Original layout";
  originalLink.hidden = !source.url;
  if (source.url) originalLink.href = source.url;
  $("share").hidden = !source.url;
}

async function showReader(runId) {
  setSummary("Loading…");
  const request = source.url
    ? ["/api/dedoom?url=" + encodeURIComponent(source.url) + "&mode=rules", {}]
    : ["/api/dedoom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: source.text, mode: "rules" }) }];
  const r = await fetch(...request);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  if (runId !== runCounter) return;
  const readerView = renderReader(body);
  applyHighlight();
  if (localModelKey()) await rewriteReaderLocally(readerView, runId);
}

// Show `source` in the current view. Each call supersedes the previous one.
async function start() {
  const runId = ++runCounter;
  showError("");
  showNotice("");
  tooltip.hide();
  setBusy(true);
  layout();
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    if (view === "page") await showPage(source.url, runId);
    else await showReader(runId);
  } catch (err) {
    if (runId !== runCounter) return;
    result.hidden = true;
    showError(err.message || "Couldn't reach dedoomify. Check your connection.");
  } finally {
    if (runId === runCounter) setBusy(false);
  }
}

function runUrl(url) {
  const qs = "url=" + encodeURIComponent(url);
  lastShare = location.origin + "/?" + qs;
  history.replaceState(null, "", "/?" + qs);
  source = { url };
  view = "page";
  start();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (activeTab === "url") {
    let url = $("url").value.trim();
    if (!url) return showError("Add a link to an article.");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    runUrl(url);
  } else {
    const text = $("text").value;
    if (!text.trim()) return showError("Paste some text to de-doom.");
    lastShare = null;
    history.replaceState(null, "", "/");
    source = { text };
    view = "reader";
    start();
  }
});

// Remember the visitor's choice of engine in this browser.
const MODE_KEY = "dedoomify.mode";
function savedMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}
modeSelect.addEventListener("change", () => {
  try { localStorage.setItem(MODE_KEY, modeSelect.value); } catch {}
});

async function init() {
  const localOptions = Object.keys(LOCAL_MODES).map((mode) => modeSelect.querySelector(`option[value="${mode}"]`));
  if (await localAi.isSupported()) {
    if (LOCAL_MODES[savedMode()]) modeSelect.value = savedMode();
  } else {
    for (const option of localOptions) {
      option.disabled = true;
      option.textContent = `On-device AI: ${localAi.MODELS[LOCAL_MODES[option.value]].label} (needs WebGPU)`;
    }
  }
  // Shared links: dedoomify.com/?url=... runs straight away.
  const params = new URLSearchParams(location.search);
  if (params.get("url")) {
    $("url").value = params.get("url");
    runUrl(params.get("url"));
  }
}
init();
