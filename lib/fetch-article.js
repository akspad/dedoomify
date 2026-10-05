import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

// News sites like CNN ship 5+ MB of HTML, mostly inline scripts and JSON that
// get stripped before the page is sent on, so allow well past that.
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; dedoomify/1.0; +https://dedoomify.com)";

export class FetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function isPrivateIPv4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    // IANA special-purpose space is not a public fetch destination. Reject
    // the small protocol-assignment block conservatively, including anycast
    // exceptions; none is needed for article/image hosting.
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function mappedIPv4(ip) {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (!net.isIPv6(ip)) return true;
  // URL parsing canonicalizes expanded/uppercase IPv6 and embedded IPv4.
  const lower = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = mappedIPv4(lower);
  if (mapped) return isPrivateIPv4(mapped);
  const [first, second = "0"] = lower.split(":");
  const group = parseInt(first || "0", 16);
  // Allow native global unicast only (2000::/3), excluding IANA special-use
  // assignments, translation/tunnel prefixes and documentation space.
  // https://www.iana.org/assignments/iana-ipv6-special-registry/
  return group < 0x2000 || group > 0x3fff ||
    (group === 0x2001 && (parseInt(second || "0", 16) <= 0x1ff || second === "db8")) ||
    group === 0x2002 || group === 0x3fff;
}

async function resolvePublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new FetchError("Links with credentials aren't supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new FetchError("That address isn't publicly reachable.");
  }
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FetchError("Couldn't find that website.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchError("That address isn't publicly reachable.");
  }
  return {
    url,
    addresses: addresses.map((address) => ({ address, family: net.isIP(address) })),
  };
}

// Only public http(s) hosts may be fetched, so the function can't be used to
// reach internal services.
export async function assertPublicUrl(raw) {
  return (await resolvePublicUrl(raw)).url;
}

// Pin the HTTP connection to the exact public addresses we validated. Without
// this, an attacker-controlled hostname could resolve publicly during the
// safety check and then rebind to a private address when fetch() resolves it
// again.
function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const family = typeof options === "number" ? options : options?.family || 0;
    const candidates = family ? addresses.filter((a) => a.family === family) : addresses;
    const list = candidates.length ? candidates : addresses;
    if (typeof options === "object" && options?.all) {
      callback(null, list);
      return;
    }
    const first = list[0];
    if (!first) {
      callback(new Error("No public address available"));
      return;
    }
    callback(null, first.address, first.family);
  };
}

function fetchPinned(url, addresses, options) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(url, {
      method: "GET",
      headers: options.headers,
      signal: options.signal,
      lookup: pinnedLookup(addresses),
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 250,
    }, (res) => {
      resolve({
        status: res.statusCode || 0,
        ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
        headers: new Headers(res.headers),
        body: Readable.toWeb(res),
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function readLimited(response, maxBytes = MAX_BYTES) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError(maxBytes === MAX_BYTES ? "That page is too big for dedoomify to load (over 15 MB). Try pasting the article text instead." : "That image is too big (over 2 MB).", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function discardBody(response) {
  // Redirects and rejected responses may carry an arbitrarily large or slow
  // body. Close the upstream stream before validating the next destination.
  try { await response.body?.cancel(); } catch {}
}

async function fetchPublic(rawUrl, fetchImpl, image = false, asset = false) {
  let resolved = await resolvePublicUrl(rawUrl);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url, addresses } = resolved;
    let response;
    const options = {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: asset ? "text/css,font/woff2,font/woff,font/ttf,font/otf,image/*;q=0.9" : image ? "image/avif,image/webp,image/png,image/jpeg,image/gif" : "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
        "accept-encoding": "identity",
      },
    };
    try {
      response = fetchImpl
        ? await fetchImpl(url, options)
        : await fetchPinned(url, addresses, options);
    } catch (err) {
      if (signal.aborted || err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new FetchError("That site took too long to respond.", 504);
      }
      throw new FetchError("Couldn't reach that website.", 502);
    }
    if (response.status >= 300 && response.status < 400) {
      await discardBody(response);
      const location = response.headers.get("location");
      if (!location) throw new FetchError("That site sent a broken redirect.", 502);
      resolved = await resolvePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      await discardBody(response);
      throw new FetchError(
        `That site responded with an error (${response.status}). It may block automated readers; try pasting the text instead.`,
        502,
      );
    }
    const type = response.headers.get("content-type") || "";
    if (asset ? !/^(?:text\/css|font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|vnd\.ms-fontobject|x-font-(?:ttf|otf))|image\/(?:png|jpeg|gif|webp|avif|svg\+xml))(?:;|$)/i.test(type) : image ? !/^image\/(?:png|jpeg|gif|webp|avif)(?:;|$)/i.test(type) : !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      await discardBody(response);
      throw new FetchError(asset ? "That link isn't a supported page resource." : image ? "That link isn't a supported image." : "That link isn't a web page.", 415);
    }
    let body;
    try {
      body = await readLimited(response, (image || asset) ? 2 * 1024 * 1024 : MAX_BYTES);
    } catch (err) {
      if (err instanceof FetchError) throw err;
      if (signal.aborted || err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new FetchError("That site took too long to respond.", 504);
      }
      throw new FetchError("Couldn't finish loading that website.", 502);
    }
    return { body, finalUrl: url.toString(), contentType: type };
  }
  throw new FetchError("That link redirects too many times.", 502);
}

export async function fetchHtml(rawUrl, fetchImpl = null) {
  const { body, ...result } = await fetchPublic(rawUrl, fetchImpl);
  return { ...result, html: new TextDecoder("utf-8").decode(body) };
}

// Raster images only: SVG/XML can contain active subresources. Every DNS
// answer and redirect is checked and the connection is pinned, as for pages.
export async function fetchImage(rawUrl, fetchImpl = null) {
  return fetchPublic(rawUrl, fetchImpl, true);
}

// Styles, fonts and artwork use the same redirect checks and pinned connection.
export async function fetchAsset(rawUrl, fetchImpl = null) {
  return fetchPublic(rawUrl, fetchImpl, false, true);
}

const BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre";

function cleanText(s) {
  return s.replace(/\s+/g, " ").trim();
}

// Turn an HTML page into { title, byline, siteName, blocks: [{ type, text }] }.
export function extractArticle(html, url) {
  const { document } = parseHTML(html);
  const article = new Readability(document, { charThreshold: 200 }).parse();
  const blocks = [];
  if (article?.content) {
    const { document: content } = parseHTML(
      `<!doctype html><html><body>${article.content}</body></html>`,
    );
    // <q> supplies quotation marks at render time, so textContent alone would
    // lose the fact that its words are a direct quotation. Materialize marks
    // before extracting reader text so the rewrite layer protects them too.
    for (const q of content.querySelectorAll("q")) {
      q.textContent = "\u201c" + (q.textContent || "") + "\u201d";
    }
    for (const el of content.querySelectorAll(BLOCK_SELECTOR)) {
      // Skip containers whose text is already covered by a nested block.
      if (el.querySelector(BLOCK_SELECTOR)) continue;
      const text = cleanText(el.textContent || "");
      if (!text) continue;
      const tag = el.tagName.toLowerCase();
      const inQuote = tag === "blockquote" || Boolean(el.closest("blockquote"));
      const type = inQuote ? "quote" : /^h[1-6]$/.test(tag) ? "heading" : tag === "li" ? "item" : "paragraph";
      blocks.push({ type, text });
    }
    if (blocks.length === 0 && article.textContent) {
      for (const para of article.textContent.split(/\n\s*\n/)) {
        const text = cleanText(para);
        if (text) blocks.push({ type: "paragraph", text });
      }
    }
  }
  return {
    title: cleanText(article?.title || document.title || url),
    byline: article?.byline ? cleanText(article.byline) : null,
    siteName: article?.siteName ? cleanText(article.siteName) : null,
    blocks,
  };
}

export function textToArticle(text, title = "Your text") {
  const blocks = String(text)
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(cleanText)
    .filter(Boolean)
    .map((t) => ({ type: "paragraph", text: t }));
  return { title, byline: null, siteName: null, blocks };
}

export async function fetchArticle(rawUrl, fetchImpl = null) {
  const { html, finalUrl, contentType } = await fetchHtml(rawUrl, fetchImpl);
  const article = /text\/plain/i.test(contentType)
    ? textToArticle(html, finalUrl)
    : extractArticle(html, finalUrl);
  if (article.blocks.length === 0) {
    throw new FetchError(
      "Couldn't find an article on that page. Try pasting the text instead.",
      422,
    );
  }
  return { ...article, url: finalUrl };
}
