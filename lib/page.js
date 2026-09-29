import { parseHTML } from "linkedom";
import "../shared/dedoom-core.js";
import "../shared/page-dedoom.js";

const { dedoomText } = globalThis.Dedoom;
const { dedoomElement } = globalThis.DedoomPage;

// The rewritten page is shown in a sandboxed frame on dedoomify.com. It keeps
// the original's markup, styles and images, but never runs its scripts: the
// frame's sandbox and this policy both forbid them.
export const PAGE_CSP = [
  "default-src 'none'",
  "style-src * data: 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "media-src *",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox",
].join("; ");

// Marks stay readable on any page, so they use fixed colours and !important.
export const PAGE_CSS = `
mark.dd {
  background: #d9f0dc !important; color: #173d2a !important;
  box-shadow: inset 0 -2px 0 #2f6b4f; border-radius: 3px; padding: 0 0.1em;
  cursor: help; font: inherit; text-decoration: none;
}
del.dd { color: #a8452f !important; background: none !important; text-decoration: line-through !important; cursor: help; }
mark.dd.dd-active { outline: 2px solid #2f6b4f; outline-offset: 1px; }
html.dd-off mark.dd { background: none !important; color: inherit !important; box-shadow: none; padding: 0; cursor: inherit; outline: none; }
html.dd-off del.dd { display: none !important; }
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
