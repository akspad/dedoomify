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
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
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
  const lower = ip.toLowerCase();
  const mapped = mappedIPv4(lower);
  if (mapped) return isPrivateIPv4(mapped);
  return (
    lower === "::" ||
    lower === "::1" ||
    // IPv4-translatable addresses are not globally routable and can hide an
    // IPv4 destination from the checks above.
    lower.startsWith("::ffff:0:") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff")
  );
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

async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError("That page is too big for dedoomify to load (over 15 MB). Try pasting the article text instead.", 413);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export async function fetchHtml(rawUrl, fetchImpl = null) {
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
        accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
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
      const location = response.headers.get("location");
      if (!location) throw new FetchError("That site sent a broken redirect.", 502);
      resolved = await resolvePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new FetchError(
        `That site responded with an error (${response.status}). It may block automated readers; try pasting the text instead.`,
        502,
      );
    }
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new FetchError("That link isn't a web page.", 415);
    }
    return { html: await readLimited(response), finalUrl: url.toString(), contentType: type };
  }
  throw new FetchError("That link redirects too many times.", 502);
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
      const type = /^h[1-6]$/.test(tag) ? "heading" : tag === "li" ? "item" : tag === "blockquote" ? "quote" : "paragraph";
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
