import * as localAi from "./local-ai.js";

const $ = (id) => document.getElementById(id);
const form = $("form"), go = $("go"), errorEl = $("error");
const result = $("result"), articleEl = $("article"), notice = $("notice");
const modeSelect = $("mode");
const tabUrl = $("tab-url"), tabText = $("tab-text");
const panelUrl = $("panel-url"), panelText = $("panel-text");
const { dedoomText } = globalThis.Dedoom;
const { STYLE_GUIDE } = globalThis.DedoomPrompt;

let activeTab = "url";
let lastShare = null;
let current = null; // { data, nodes, runId }
let runCounter = 0;

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

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const c of children || []) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function renderSegments(parent, original, rewritten) {
  for (const seg of DedoomDiff.diffSegments(original, rewritten)) {
    if (seg.original === undefined) {
      parent.appendChild(document.createTextNode(seg.text));
    } else if (seg.text) {
      parent.appendChild(el("mark", { class: "dd", title: seg.original ? "Was: " + seg.original : "Added" }, [seg.text]));
    } else if (seg.original) {
      parent.appendChild(el("del", { class: "dd", title: "Removed" }, [seg.original]));
    }
  }
}

const TAGS = { heading: "h2", paragraph: "p", item: "li", quote: "blockquote" };
const ENGINE_NAMES = { claude: "Claude", rules: "the phrase rules", local: `${localAi.MODEL_LABEL} on your device` };

// A block renders as its text plus a hidden "Original:" line for the toggle.
function blockNodes(block) {
  const node = el(TAGS[block.type] || "p", {}, []);
  renderSegments(node, block.original, block.text);
  const nodes = [node];
  if (block.original !== block.text) nodes.push(el("p", { class: "original" }, ["Original: " + block.original]));
  return nodes;
}

function metaText(data) {
  const changed = data.blocks.filter((b) => b.text !== b.original).length;
  return `Reframed by dedoomify, not the original. ${changed} of ${data.blocks.length} paragraphs changed by ${ENGINE_NAMES[data.engine] || "the phrase rules"}. `;
}

function render(data, sourceUrl) {
  articleEl.textContent = "";
  const h1 = el("h1", {}, []);
  renderSegments(h1, data.originalTitle || data.title, data.title);
  articleEl.appendChild(h1);
  const parts = [data.siteName, data.byline].filter(Boolean);
  if (parts.length) articleEl.appendChild(el("p", { class: "meta" }, [parts.join(" · ")]));
  const meta = el("p", { class: "meta" }, []);
  const metaLine = document.createTextNode(metaText(data));
  meta.appendChild(metaLine);
  if (sourceUrl) meta.appendChild(el("a", { href: sourceUrl, rel: "noopener noreferrer", target: "_blank" }, ["Read the original"]));
  articleEl.appendChild(meta);

  const nodes = data.blocks.map((block) => {
    const group = blockNodes(block);
    group.forEach((n) => articleEl.appendChild(n));
    return group;
  });
  if (!data.blocks.some((b) => b.text !== b.original) && data.engine !== "local") {
    articleEl.appendChild(el("p", { class: "empty" }, ["Good news: we didn't find any doom to remove."]));
  }
  showNotice(data.notice);
  result.hidden = false;
  applyToggles();
  return { data, nodes, metaLine };
}

function updateBlock(view, i, text) {
  const block = view.data.blocks[i];
  block.text = text;
  const fresh = blockNodes(block);
  const old = view.nodes[i];
  old[0].replaceWith(...fresh);
  old.slice(1).forEach((n) => n.remove());
  view.nodes[i] = fresh;
  view.metaLine.textContent = metaText(view.data);
}

function applyToggles() {
  articleEl.classList.toggle("show-changes", $("show-changes").checked);
  articleEl.classList.toggle("show-original", $("show-original").checked);
}
$("show-changes").addEventListener("change", applyToggles);
$("show-original").addEventListener("change", applyToggles);

$("share").addEventListener("click", function () {
  const link = lastShare || location.href;
  const btn = this;
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
    .then(() => { btn.textContent = "Link copied"; })
    .catch(() => { prompt("Copy this link:", link); })
    .then(() => setTimeout(() => { btn.textContent = "Copy share link"; }, 2000));
});

function setBusy(busy, label) {
  go.disabled = busy;
  go.textContent = busy ? label || "De-dooming…" : "De-doom it";
}

// Rewrites the paragraphs that need it with the on-device model, updating the
// page as each one finishes. The phrase-rules version stays for any paragraph
// the model gets wrong.
async function rewriteLocally(view, runId) {
  const stale = () => runId !== runCounter;
  const { data } = view;
  const title = { original: data.originalTitle || data.title, text: data.title };
  const todo = [];
  if (localAi.needsModel(title.original, title.text)) todo.push(-1);
  data.blocks.forEach((b, i) => { if (localAi.needsModel(b.original, b.text)) todo.push(i); });
  if (todo.length === 0) {
    showNotice("No doom framing found, so the on-device model had nothing to do.");
    return;
  }

  let engine;
  try {
    showNotice("Loading the on-device model…");
    engine = await localAi.loadEngine((report) => {
      if (stale()) return;
      const pct = Math.round((report.progress || 0) * 100);
      showNotice(`Loading ${localAi.MODEL_LABEL} on your device: ${pct}%. This is a one-time download of about 1 GB; next time it loads from your browser's cache.`);
    });
  } catch (err) {
    console.error(err);
    if (!stale()) showNotice("The on-device model couldn't load in this browser, so this uses the quick phrase rules.");
    return;
  }

  data.engine = "local";
  let done = 0, kept = 0;
  for (const i of todo) {
    if (stale()) return;
    showNotice(`Rewriting on your device: ${done} of ${todo.length} paragraphs done.`);
    const original = i === -1 ? title.original : data.blocks[i].original;
    try {
      const output = await localAi.rewriteParagraph(engine, STYLE_GUIDE, original);
      if (stale()) return;
      if (localAi.acceptRewrite(original, output)) {
        // The rules catch anything the model left behind.
        const text = dedoomText(output);
        if (i === -1) {
          data.title = text;
          const h1 = articleEl.querySelector("h1");
          h1.textContent = "";
          renderSegments(h1, title.original, text);
        } else {
          updateBlock(view, i, text);
        }
      } else {
        kept++;
      }
    } catch (err) {
      console.error(err);
      kept++;
    }
    done++;
  }
  view.metaLine.textContent = metaText(data);
  showNotice(
    `Rewritten on your device by ${localAi.MODEL_LABEL}; nothing was sent to a server.` +
      (kept ? ` ${kept} paragraph${kept === 1 ? "" : "s"} kept the phrase-rules version because the model's rewrite didn't match the original's facts.` : ""),
  );
}

async function run(request, sourceUrl) {
  const runId = ++runCounter;
  showError("");
  setBusy(true);
  try {
    const r = await fetch(request.url, request.init);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Something went wrong. Please try again.");
    if (runId !== runCounter) return;
    const view = render(body, body.url || sourceUrl);
    $("share").hidden = !sourceUrl;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
    if (modeSelect.value === "local") {
      setBusy(true, "Rewriting…");
      await rewriteLocally(view, runId);
    }
  } catch (err) {
    showError(err.message || "Couldn't reach dedoomify. Check your connection.");
  } finally {
    if (runId === runCounter) setBusy(false);
  }
}

// The server always does the free part: fetching and the phrase rules.
function runUrl(url) {
  const qs = "url=" + encodeURIComponent(url);
  lastShare = location.origin + "/?" + qs;
  history.replaceState(null, "", "/?" + qs);
  return run({ url: "/api/dedoom?" + qs + "&mode=rules", init: {} }, url);
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
    run({
      url: "/api/dedoom",
      init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, mode: "rules" }) },
    }, null);
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
  const localOption = modeSelect.querySelector('option[value="local"]');
  if (await localAi.isSupported()) {
    if (savedMode() === "local") modeSelect.value = "local";
  } else {
    localOption.disabled = true;
    localOption.textContent = "On-device AI (needs a browser with WebGPU)";
  }
  // Shared links: dedoomify.com/?url=... runs straight away.
  const params = new URLSearchParams(location.search);
  if (params.get("url")) {
    $("url").value = params.get("url");
    runUrl(params.get("url"));
  }
}
init();
