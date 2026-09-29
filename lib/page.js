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
// the original's markup, styles and images, but never runs its scripts: they
// are all removed, and this policy only allows the hover card's script.
export const PAGE_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "style-src * data: 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "media-src *",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox",
].join("; ");

// Marks stay readable on any page, so they use fixed colours and !important.
// The card resets inherited styles so the page's CSS can't change it.
export const PAGE_CSS = `
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

const URL_ATTRS = ["href", "src", "action", "formaction", "xlink:href", "poster", "background", "data"];
const REMOVE = "script, iframe, frame, frameset, object, embed, applet, portal, base, meta[http-equiv], meta[charset]";

// Pages that lazy-load images with a script keep the real URL in a data- attribute.
function unlazy(el) {
  for (const [from, to] of [["data-src", "src"], ["data-lazy-src", "src"], ["data-original", "src"], ["data-srcset", "srcset"], ["data-lazy-srcset", "srcset"]]) {
    const value = el.getAttribute(from);
    const current = el.getAttribute(to);
    if (value && (!current || current.startsWith("data:"))) el.setAttribute(to, value);
  }
}

function sanitize(document) {
  for (const el of [...document.querySelectorAll(REMOVE)]) el.remove();
  for (const link of [...document.querySelectorAll("link")]) {
    if (!/\b(stylesheet|icon)\b/i.test(link.getAttribute("rel") || "")) link.remove();
  }
  for (const el of [...document.querySelectorAll("*")]) {
    for (const { name, value } of [...el.attributes]) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on") || lower === "srcdoc") {
        el.removeAttribute(name);
      } else if (URL_ATTRS.includes(lower) && /^\s*(javascript|vbscript|data:text\/html)/i.test(value)) {
        el.removeAttribute(name);
      }
    }
    const tag = el.tagName.toUpperCase();
    if (tag === "IMG" || tag === "SOURCE") unlazy(el);
    // Links open the real site in a new tab rather than inside the frame.
    if (tag === "A" || tag === "AREA") {
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

// Rewrite a fetched page with the phrase rules, keeping its layout. Returns
// { html, title, changed }.
export function renderPage(html, pageUrl) {
  const document = parsePage(html);
  // Relative links, styles and images resolve against the original page.
  const existingBase = document.querySelector("base[href]")?.getAttribute("href");
  let baseHref = pageUrl;
  try {
    if (existingBase) baseHref = new URL(existingBase, pageUrl).toString();
  } catch {}
  sanitize(document);

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
  const base = document.createElement("base");
  base.setAttribute("href", baseHref);
  base.setAttribute("target", "_blank");
  // No referrer, so sites that block hotlinked images still serve them.
  head.prepend(meta({ charset: "utf-8" }), base, meta({ name: "referrer", content: "no-referrer" }));
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
