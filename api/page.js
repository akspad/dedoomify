import { articleLimit } from "../lib/rate-limit.js";
import { fetchHtml, FetchError } from "../lib/fetch-article.js";
import { renderPage, textToHtml, errorPage, PAGE_CSP } from "../lib/page.js";

function send(res, status, html) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("content-security-policy", PAGE_CSP);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  // Private: the response depends on how it was requested (see below).
  res.setHeader("cache-control", status === 200 ? "private, max-age=300" : "no-store");
  res.end(html);
}

// GET /api/page?url=<article>
// The original page, rewritten with the phrase rules and with its scripts
// removed, for the frame on dedoomify.com.
export default async function handler(req, res, deps = {}) {
  const fetchHtmlImpl = deps.fetchHtml ?? fetchHtml;
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return send(res, 405, errorPage("Method not allowed."));
  }
  const url = new URL(req.url, "http://localhost").searchParams.get("url");
  if (!url) return send(res, 400, errorPage("Add a link to an article."));
  // Opened directly rather than in dedoomify's frame: send people to the site,
  // so the page is never shown without the banner saying it was rewritten.
  if (req.headers?.["sec-fetch-dest"] === "document") {
    res.statusCode = 302;
    res.setHeader("location", "/?url=" + encodeURIComponent(url));
    res.setHeader("cache-control", "no-store");
    return res.end();
  }
  const limit = (deps.rateLimit ?? articleLimit)(req);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfter));
    return send(res, 429, errorPage("Too many articles. Please try again in a minute."));
  }
  try {
    const { html, finalUrl, contentType } = await fetchHtmlImpl(url.trim());
    const source = /text\/plain/i.test(contentType) ? textToHtml(html, finalUrl) : html;
    return send(res, 200, renderPage(source, finalUrl).html);
  } catch (err) {
    if (err instanceof FetchError) return send(res, err.status, errorPage(err.message));
    console.error(err);
    return send(res, 500, errorPage("Something went wrong on our side."));
  }
}
