import * as localAi from "./local-ai.js";
import * as tooltip from "./tooltip.js";

const $ = (id) => document.getElementById(id);
const form = $("form"), go = $("go"), errorEl = $("error");
const result = $("result"), articleEl = $("article"), notice = $("notice");
const frame = $("page"), summary = $("summary");
const viewToggle = $("view-toggle"), originalLink = $("original-link");
const modeSelect = $("mode");
const tabUrl = $("tab-url"), tabText = $("tab-text");
const panelUrl = $("panel-url"), panelText = $("panel-text");
const demo = $("demo");
// With reduced motion, the demo waits for a press instead of autoplaying.
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const video = demo.querySelector("video");
  video.removeAttribute("autoplay");
  video.pause();
  video.controls = true;
}
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
  tabUrl.tabIndex = which === "url" ? 0 : -1;
  tabText.tabIndex = which === "text" ? 0 : -1;
  panelUrl.hidden = which !== "url";
  panelText.hidden = which !== "text";
}
tabUrl.addEventListener("click", () => selectTab("url"));
tabText.addEventListener("click", () => selectTab("text"));
for (const tab of [tabUrl, tabText]) tab.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? "url" : event.key === "End" ? "text" : activeTab === "url" ? "text" : "url";
  selectTab(next);
  (next === "url" ? tabUrl : tabText).focus();
});

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
const LOCAL_MODES = { local: "qwen" };
// The engine is fixed when a run starts, so a change to the picker mid-run
// can't mix engines or put the wrong one in the share link.
let runModelKey;
const localModelKey = () => runModelKey;

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
  unpinOnInput(doc);
  pin();
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
    .concat(data.blocks.map((b, index) => ({ index, type: b.type, original: b.original, current: b.text })))
    .filter((item) => item.type !== "quote" && localAi.needsModel(item.original, item.current));
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

// Phones and tablets get the system share sheet; elsewhere the button copies
// the link.
const shareButton = $("share");
const touch = matchMedia("(pointer: coarse)").matches;
const canShare = touch && typeof navigator.share === "function";
const shareLabel = canShare ? "Share" : touch ? "Copy link" : "Copy share link";
shareButton.textContent = shareLabel;
shareButton.addEventListener("click", function () {
  const link = lastShare || location.href;
  const btn = this;
  if (canShare) {
    navigator.share({ title: frame.contentDocument?.title || document.title, url: link }).catch(() => {});
    return;
  }
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
    .then(() => { btn.textContent = "Link copied"; })
    .catch(() => { prompt("Copy this link:", link); })
    .then(() => setTimeout(() => { btn.textContent = shareLabel; }, 2000));
});

viewToggle.addEventListener("click", () => {
  view = view === "page" ? "reader" : "page";
  start();
});

function setBusy(busy) {
  go.disabled = busy;
  $("random").disabled = busy;
  $("random-banner").disabled = busy;
  go.textContent = busy ? "De-dooming…" : "De-doom it";
}

function layout() {
  const page = view === "page";
  result.classList.toggle("page-view", page);
  frame.hidden = !page;
  articleEl.hidden = page;
  $("show-original-wrap").hidden = page;
  viewToggle.hidden = !source.url;
  viewToggle.innerHTML = page
    ? '<span class="long">Reader view</span><span class="short">Reader</span>'
    : '<span class="long">Page view</span><span class="short">Page view</span>';
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

// While a result loads, keep its banner at the top of the window, even if the
// progress line comes and goes or a smooth scroll gets cut short. Stops as
// soon as the reader scrolls or clicks the page themselves.
let pinned = false;
function pin(force) {
  if (!(pinned || force) || result.hidden) return;
  fitResult();
  scrollTo(0, scrollY + result.getBoundingClientRect().top);
}
// The page view fills exactly the window. CSS sizes it with 100dvh, but some
// browsers (Safari) make that a little shorter than the window, which leaves
// the page too short to scroll the banner all the way up. Use the window's
// real height instead.
function fitResult() {
  result.style.height = result.classList.contains("page-view") ? innerHeight + "px" : "";
}
addEventListener("resize", () => { fitResult(); pin(); });
function unpinOnInput(target) {
  for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) {
    target.addEventListener(type, () => { pinned = false; }, { passive: true });
  }
}
unpinOnInput(window);
// A reader sitting at the banner stays there when the banner changes height
// (the progress line clearing), even after they have scrolled or clicked.
let atTop = false;
addEventListener("scroll", () => {
  atTop = !result.hidden && Math.abs(result.getBoundingClientRect().top) < 2;
}, { passive: true });
new ResizeObserver(() => pin(atTop)).observe($("banner"));

// Show `source` in the current view. Each call supersedes the previous one.
async function start({ instant = false } = {}) {
  const runId = ++runCounter;
  runModelKey = LOCAL_MODES[modeSelect.value];
  if (source.url) {
    // The link records the engine too, so whoever opens it sees the same rewrite.
    const qs = "url=" + encodeURIComponent(source.url) + "&mode=" + (runModelKey ? "local" : "rules");
    lastShare = location.origin + "/?" + qs;
    history.replaceState(null, "", "/?" + qs);
  }
  showError("");
  showNotice("");
  tooltip.hide();
  setBusy(true);
  layout();
  result.hidden = false;
  $("random").textContent = "Try another article";
  demo.hidden = true;
  demo.querySelector("video").pause();
  pinned = true;
  fitResult();
  if (instant) pin();
  else result.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    if (view === "page") await showPage(source.url, runId);
    else await showReader(runId);
  } catch (err) {
    if (runId !== runCounter) return;
    result.hidden = true;
    $("random").textContent = "Try it on a real article";
    demo.hidden = false;
    showError(err.message || "Couldn't reach dedoomify. Check your connection.");
  } finally {
    if (runId === runCounter) setBusy(false);
  }
}

function runUrl(url, options) {
  source = { url };
  view = "page";
  start(options);
}

// Real AI doom stories that render well through /api/page. Each one gets more
// than 6 changes from the phrase rules alone, so the demo shows the rules at
// work before the on-device model is involved.
const DOOM_STORIES = [
  "https://techcrunch.com/2026/09/28/openai-still-doesnt-seem-to-have-a-handle-on-all-of-its-rogue-ai-activity/",
  "https://www.progressiverobot.com/2026/09/29/ai-self-preservation-anthropic-ipo-filing-existential-risks/",
  "https://c3.unu.edu/blog/the-rise-of-the-deceptive-machines-when-ai-learns-to-lie",
  "https://www.lawfaremedia.org/article/rogue-ai-moves-three-steps-closer",
  "https://hatchworks.com/blog/gen-ai/ai-model-misbehavior/",
  "https://www.lbc.co.uk/article/superintelligence-ai-extinction-risk-ban-opinion-5Hjdhfb_2/",
  "https://palisaderesearch.org/research/shutdown-resistance",
  "https://em360tech.com/tech-articles/what-agentic-misalignment-ai-threat-can-blackmail-sabotage-and-kill",
  "https://fortune.com/2026/04/01/ai-models-will-secretly-scheme-to-protect-other-ai-models-from-being-shut-down-researchers-find/",
  "https://science-technology.news-articles.net/content/2026/07/23/rogue-ai-models-the-risks-of-deceptive-alignment.html",
  "https://interestingengineering.com/culture/truth-about-ai-deception",
  "https://www.commondreams.org/news/ai-chatbots-scheming",
  "https://www.tomshardware.com/tech-industry/artificial-intelligence/openai-and-anthropic-are-reportedly-investigating-tens-of-thousands-of-ai-security-incidents-openai-pauses-testing-after-ai-kill-switch-fails-to-stop-a-rogue-agent-report-says-problem-is-orders-of-magnitude-more-complex-than-what-is-publicly-known",
  "https://www.datamation.com/artificial-intelligence/ai-models-scheme-against-creators/",
  "https://www.computerworld.com/article/4154447/ai-shutdown-controls-may-not-work-as-expected-new-study-suggests.html",
  "https://www.theregister.com/software/2026/04/03/ai-models-will-deceive-you-to-save-their-own-kind/5228347",
  "https://techcrunch.com/2025/09/18/openais-research-on-ai-models-deliberately-lying-is-wild/",
  "https://fortune.com/2026/07/22/openai-rogue-hack-hugging-face-misalignment-ai-safety/",
  "https://www.lawfaremedia.org/article/ai-might-let-you-die-to-save-itself",
  "https://www.computerworld.com/article/4153919/why-ai-lies-cheats-and-steals.html",
  "https://time.com/7202784/ai-research-strategic-lying/",
  "https://gulfnews.com/technology/media/ai-that-lies-openai-study-finds-chatbots-can-deceive-users-1.500275771",
  "https://www.yahoo.com/news/ai-models-sabotage-blackmail-humans-163820126.html",
  "https://fortune.com/2026/04/03/ai-kill-switch-study-llm-chatbots-defy-orders-decieve-users-peer-preservation/",
  "https://fortune.com/2023/11/03/ai-bot-insider-trading-deceived-users/",
];
// The first try is always the first story; after that, any story except the
// one just shown.
let lastStory = null;
function tryAnother() {
  const choices = DOOM_STORIES.filter((u) => u !== lastStory && u !== source?.url);
  const url = !lastStory && choices.includes(DOOM_STORIES[0])
    ? DOOM_STORIES[0]
    : choices[Math.floor(Math.random() * choices.length)];
  lastStory = url;
  selectTab("url");
  $("url").value = url;
  showError("");
  runUrl(url);
}
$("random").addEventListener("click", tryAnother);
$("random-banner").addEventListener("click", tryAnother);

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
  let mode = null;
  try { mode = localStorage.getItem(MODE_KEY); } catch {}
  // Older picks of the retired on-device models now mean the one that's left.
  return /^local-/.test(mode || "") ? "local" : mode;
}
modeSelect.addEventListener("change", () => {
  try { localStorage.setItem(MODE_KEY, modeSelect.value); } catch {}
});

async function init() {
  const localOptions = Object.keys(LOCAL_MODES).map((mode) => modeSelect.querySelector(`option[value="${mode}"]`));
  const params = new URLSearchParams(location.search);
  const linkMode = params.get("mode");
  const webgpu = await localAi.isSupported();
  if (webgpu) {
    if (LOCAL_MODES[savedMode()]) modeSelect.value = savedMode();
    // A shared link's engine wins for this visit, without changing the saved choice.
    if (linkMode === "rules" || LOCAL_MODES[linkMode]) modeSelect.value = linkMode;
  } else {
    for (const option of localOptions) {
      option.disabled = true;
      option.textContent = "On-device AI (needs WebGPU)";
    }
  }
  // Shared links: dedoomify.com/?url=...&mode=... runs straight away.
  if (params.get("url")) {
    $("url").value = params.get("url");
    // Jump straight to the result rather than restoring an old scroll spot.
    history.scrollRestoration = "manual";
    runUrl(params.get("url"), { instant: true });
    if (LOCAL_MODES[linkMode] && !webgpu) {
      showNotice("This link was shared with the on-device AI rewrite, which needs WebGPU, so it shows the quick phrase rules version.");
    }
  }
}
init();
