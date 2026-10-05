import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import "../shared/dedoom-core.js";
import "../shared/page-dedoom.js";

const { dedoomText } = globalThis.Dedoom;
const { dedoomElement } = globalThis.DedoomPage;

// The hover card with the original words. It runs inside the frame because
// Safari and Firefox don't deliver the frame's mouse events to listeners the
// site adds from outside. It is the only script the page may run: the policy
// below allows exactly this script by its hash.
export const PAGE_SCRIPT = `(function () {
  var tip = document.createElement("div");
  tip.id = "dd-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  var label = document.createElement("span");
  label.className = "dd-tip-label";
  var text = document.createElement("span");
  text.className = "dd-tip-text";
  tip.appendChild(label);
  tip.appendChild(text);
  document.body.appendChild(tip);
  var active = null;
  function find(t) { return t && t.closest ? t.closest("mark.dd, del.dd") : null; }
  function hide() {
    if (active) active.classList.remove("dd-active");
    active = null;
    tip.hidden = true;
  }
  function show(el) {
    if (el === active && !tip.hidden) return;
    hide();
    if (document.documentElement.classList.contains("dd-off")) return;
    var was = (el.getAttribute("data-was") || "").replace(/\\s+/g, " ").trim();
    var isDel = el.tagName.toUpperCase() === "DEL";
    label.textContent = isDel ? "Removed by dedoomify" : was ? "Original text" : "Added by dedoomify";
    text.textContent = "\\u201c" + (was || el.textContent.trim()) + "\\u201d";
    active = el;
    el.classList.add("dd-active");
    tip.hidden = false;
    var r = el.getClientRects()[0] || el.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
    var center = r.left + r.width / 2;
    var left = Math.min(Math.max(center - w / 2, 8), vw - w - 8);
    var top = r.top - h - 10, place = "above";
    if (top < 8) { top = r.bottom + 10; place = "below"; }
    tip.setAttribute("data-place", place);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tip.style.setProperty("--arrow-x", Math.min(Math.max(center - left, 14), w - 14) + "px");
  }
  document.addEventListener("mouseover", function (e) { var el = find(e.target); if (el) show(el); });
  document.addEventListener("mouseout", function (e) {
    var el = find(e.target);
    if (el && el === active && !el.contains(e.relatedTarget)) hide();
  });
  // Touch screens have no hover, so a tap shows it too. On a highlight inside
  // a link, the first tap only shows the card; a second tap follows the link.
  var touch = false, wasOpen = false;
  document.addEventListener("pointerdown", function (e) {
    touch = e.pointerType !== "mouse";
    var el = find(e.target);
    wasOpen = !!el && el === active && !tip.hidden;
  });
  document.addEventListener("click", function (e) {
    var el = find(e.target);
    if (!el) return hide();
    if (touch && !wasOpen && el.closest("a[href]") && !document.documentElement.classList.contains("dd-off")) e.preventDefault();
    show(el);
  });
  document.addEventListener("scroll", hide, { capture: true, passive: true });
  window.addEventListener("resize", hide);
})();`;

const SCRIPT_HASH = createHash("sha256").update(PAGE_SCRIPT).digest("base64");

// The rewritten page is shown in a sandboxed frame on dedoomify.com. It keeps
// the original's article markup and proxied raster images. Remote CSS and
// active content are removed; they
// are all removed, and this policy only allows the hover card's script.
export const PAGE_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'none'",
  "media-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox",
].join("; ");

// Marks stay readable on any page, so they use fixed colours and !important.
// The card resets inherited styles so the page's CSS can't change it.
export const PAGE_CSS = `
body { font: 18px/1.6 Georgia, serif; max-width: 960px; margin: 32px auto; padding: 0 20px; color: #202820; background: #fff; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
pre { overflow: auto; }

mark.dd {
  background: #fff0a0 !important; color: #3a2e00 !important;
  border-radius: 3px; padding: 0 0.1em;
  cursor: help; font: inherit;
  /* Pages often style <mark> with an underline, border or shadow; drop them. */
  text-decoration: none !important; box-shadow: none !important; border: 0 !important; background-image: none !important;
}
del.dd { color: #a8452f !important; background: none !important; text-decoration: line-through !important; cursor: help; }
mark.dd.dd-active { outline: 2px solid #e0b400; outline-offset: 1px; }
html.dd-off mark.dd { background: none !important; color: inherit !important; box-shadow: none; padding: 0; cursor: inherit; outline: none; }
html.dd-off del.dd { display: none !important; }
#dd-tip, #dd-tip * { all: initial; }
#dd-tip {
  position: fixed; z-index: 2147483647; display: block; box-sizing: border-box;
  max-width: min(340px, calc(100vw - 16px)); pointer-events: none;
  background: #1f2a24; color: #f3f5f2; border-radius: 10px; padding: 9px 12px 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left;
}
#dd-tip[hidden] { display: none; }
#dd-tip::after {
  content: ""; position: absolute; left: var(--arrow-x, 50%); width: 10px; height: 10px;
  background: #1f2a24; transform: translateX(-50%) rotate(45deg);
}
#dd-tip[data-place="above"]::after { bottom: -5px; }
#dd-tip[data-place="below"]::after { top: -5px; }
#dd-tip .dd-tip-label {
  display: block; margin-bottom: 3px; color: #ffd84d;
  font: 700 11px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.06em; text-transform: uppercase;
}
#dd-tip .dd-tip-text { display: block; color: #f3f5f2; font: 16px/1.35 Georgia, "Times New Roman", serif; }
`;

// Use a positive HTML/attribute policy. This removes SVG animations, native
// popovers/dialogs, CSS pseudo-elements and presentation that can hide edits.
const TAGS = new Set(("HTML HEAD TITLE BODY ARTICLE SECTION MAIN HEADER FOOTER NAV ASIDE DIV SPAN P H1 H2 H3 H4 H5 H6 A AREA IMG PICTURE UL OL LI DL DT DD TABLE THEAD TBODY TFOOT TR TH TD CAPTION COLGROUP COL B I EM STRONG SMALL SUP SUB BR HR BLOCKQUOTE Q PRE CODE KBD SAMP MARK DEL INS FIGURE FIGCAPTION DETAILS SUMMARY TIME").split(" "));
const ATTRS = new Set(["id", "class", "title", "lang", "dir", "alt", "colspan", "rowspan", "scope", "start", "reversed", "datetime", "open", "hidden"]);
const SAFE_FORMAT = {
  "font-weight": /^(?:normal|bold|[1-9]00)$/i,
  "font-style": /^(?:normal|italic|oblique)$/i,
  "text-align": /^(?:left|right|center|justify|start|end)$/i,
};
function safeStyle(value) {
  return value.split(";").flatMap((decl) => {
    const [name, ...rest] = decl.split(":");
    const key = name.trim().toLowerCase(), val = rest.join(":").trim();
    return SAFE_FORMAT[key]?.test(val) ? [`${key}:${val}`] : [];
  }).join(";");
}
function publicLink(value, base) {
  try {
    const url = new URL(value, base);
    return /^(?:https?:)$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
// Collapse responsive images to one candidate before dropping every original
// resource attribute. URLs can contain commas; descriptors end at a comma.
function srcsetImage(value, fallback = null) {
  if (!(value || "").trim()) return null;
  let hasWidth = false, hasOneX = false;
  let rest = (value || "").trim(), best = null, bestScore = -Infinity;
  while (rest) {
    const token = /^\S+/.exec(rest)?.[0];
    if (!token) break;
    rest = rest.slice(token.length).trimStart();
    let descriptor = "";
    if (!token.endsWith(",")) {
      const end = rest.indexOf(",");
      descriptor = (end < 0 ? rest : rest.slice(0, end)).trim();
      rest = end < 0 ? "" : rest.slice(end + 1).trimStart();
    }
    const url = token.replace(/,+$/, "");
    if (!url || (descriptor && !/^(?:\d+w|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?x)$/.test(descriptor))) continue;
    const size = descriptor ? parseFloat(descriptor) : 1;
    if (!Number.isFinite(size) || size <= 0) continue;
    // Fit the readable page layout, rather than always downloading an original
    // that can exceed the image proxy's byte limit. If all candidates are above
    // the bound, choose the smallest one. Density defaults to a modest 1x.
    const width = descriptor.endsWith("w");
    if (width) hasWidth = true;
    else if (size === 1) hasOneX = true;
    const bound = width ? 960 : 1;
    const score = size <= bound ? size / bound : -size / bound;
    if (score > bestScore) { best = url; bestScore = score; }
  }
  // img.src participates as 1x in density sets when no explicit 1x exists.
  if (fallback && !hasWidth && !hasOneX) return fallback;
  return best;
}
function responsiveSource(el) {
  const src = el.tagName.toUpperCase() === "IMG" ? el.getAttribute("src") : null;
  const fallback = src && !/^data:/i.test(src) ? src : null;
  const active = srcsetImage(el.getAttribute("srcset"), fallback);
  // Lazy attributes are fallbacks. Active responsive URLs can be newer than
  // leftover metadata; embedded placeholders still defer to the lazy values.
  if (active && !/^data:/i.test(active)) return active;
  return ["data-srcset", "data-lazy-srcset"].map((key) => srcsetImage(el.getAttribute(key), fallback)).find(Boolean) || active;
}
function pictureSources(document) {
  const sources = new WeakMap();
  // Each picture's direct children are visited once, including malformed pages
  // with many img siblings. The first usable preceding source wins for each img.
  for (const picture of document.querySelectorAll("picture")) {
    let candidate = null;
    for (const child of picture.children) {
      const tag = child.tagName.toUpperCase();
      if (tag === "IMG") sources.set(child, candidate);
      if (tag !== "SOURCE" || candidate) continue;
      // The server cannot know viewport/support: conditional sources retain
      // the img fallback. Only unconditional supported raster formats apply.
      const media = (child.getAttribute("media") || "").trim().toLowerCase();
      const type = (child.getAttribute("type") || "").trim().toLowerCase();
      if ((media && media !== "all") || (type && !/^image\/(?:png|jpeg|gif|webp|avif)$/.test(type))) continue;
      candidate = responsiveSource(child);
    }
  }
  return sources;
}
function imageSource(el, sources) {
  const picture = sources.get(el);
  if (picture) return picture;
  const responsive = responsiveSource(el);
  if (responsive) return responsive;
  const active = el.getAttribute("src");
  if (active && !/^data:/i.test(active)) return active;
  return ["data-src", "data-lazy-src", "data-original"].map((key) => el.getAttribute(key)).find(Boolean) || active;
}
function sanitize(document, base) {
  const sources = pictureSources(document);
  const images = new WeakMap([...document.querySelectorAll("img")].map((el) => [el, imageSource(el, sources)]));
  // Remove whole active subtrees before walking remaining markup.
  for (const el of [...document.querySelectorAll("script, style, link, iframe, frame, frameset, object, embed, applet, portal, svg, math, template, noscript, audio, video, source, track, meta, base")]) el.remove();
  for (const el of [...document.querySelectorAll("*")]) {
    const tag = el.tagName.toUpperCase();
    if (!TAGS.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    const href = el.getAttribute("href");
    const src = images.get(el);
    const style = safeStyle(el.getAttribute("style") || "");
    for (const { name } of [...el.attributes]) if (!ATTRS.has(name.toLowerCase())) el.removeAttribute(name);
    // Source pages cannot forge generated marks, change counts or tooltip IDs.
    if (/^(?:dd-|dedoomify-)/i.test(el.id || "")) el.removeAttribute("id");
    if (el.hasAttribute("class")) el.setAttribute("class", el.getAttribute("class").split(/\s+/).filter((c) => !/^dd(?:-|$)/i.test(c)).join(" "));
    if (style) el.setAttribute("style", style);
    if (tag === "IMG") {
      // No browser-origin fetch of a third-party URL, even a public hostname
      // which could redirect or resolve differently on the reader's network.
      if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(src || "")) el.setAttribute("src", src);
      else {
        const image = src && publicLink(src, base);
        if (image) el.setAttribute("src", "/api/image?url=" + encodeURIComponent(image));
      }
    }
    if (tag === "A" || tag === "AREA") {
      const link = href && publicLink(href, base);
      if (link) el.setAttribute("href", link);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
}

function parsePage(html) {
  let { document } = parseHTML(html);
  if (!document.documentElement || document.documentElement.tagName.toUpperCase() !== "HTML" || !document.body) {
    ({ document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`));
  }
  if (!document.head) document.documentElement.prepend(document.createElement("head"));
  return document;
}

// Rewrite a fetched page with the phrase rules, keeping its article markup. Returns
// { html, title, changed }.
export function renderPage(html, pageUrl) {
  const document = parsePage(html);
  // Resolve relative links and images against the original page before proxying.
  const existingBase = document.querySelector("base[href]")?.getAttribute("href");
  let baseHref = pageUrl;
  try {
    if (existingBase) baseHref = new URL(existingBase, pageUrl).toString();
  } catch {}
  sanitize(document, baseHref);

  const changed = dedoomElement(document.body, document);
  const titleEl = document.querySelector("title");
  const title = titleEl ? dedoomText(titleEl.textContent.replace(/\s+/g, " ").trim()) : "";
  if (titleEl) titleEl.textContent = title;

  const head = document.head;
  const meta = (attrs) => {
    const el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  // URLs have already been resolved. A remote <base> would redirect our
  // same-origin image proxy paths back onto the third-party host.
  head.prepend(meta({ charset: "utf-8" }), meta({ name: "referrer", content: "no-referrer" }));
  head.append(meta({ name: "dedoomify-changes", content: String(changed) }));
  const style = document.createElement("style");
  style.setAttribute("id", "dedoomify-style");
  style.textContent = PAGE_CSS;
  head.append(style);
  const script = document.createElement("script");
  script.textContent = PAGE_SCRIPT;
  document.body.append(script);

  const doctype = /^\s*<!doctype/i.test(html) ? "<!DOCTYPE html>\n" : "";
  return { html: doctype + document.documentElement.outerHTML, title, changed };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Plain-text pages become simple paragraphs so the rules can mark them.
export function textToHtml(text, title) {
  const paras = String(text)
    .split(/\r?\n\s*\r?\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("\n");
  return `<!doctype html><html><head><title>${escapeHtml(title)}</title>
<style>body{font:18px/1.6 Georgia,serif;max-width:680px;margin:40px auto;padding:0 16px;white-space:pre-line}</style>
</head><body>${paras}</body></html>`;
}

// Shown inside the frame when a page can't be loaded. The site reads the
// message from the meta tag and shows it next to the form.
export function errorPage(message) {
  const safe = escapeHtml(message);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="dedoomify-error" content="${safe}">
<style>body{font:16px/1.5 system-ui,sans-serif;color:#5d6a62;margin:40px 16px;text-align:center}</style>
</head><body><p>${safe}</p></body></html>`;
}
