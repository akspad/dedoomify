import { gzipSync } from "node:zlib";
import { rewriteCss } from "../lib/page-css.js";
import { fetchImage, fetchAsset, FetchError } from "../lib/fetch-article.js";
import { imageLimit } from "../lib/rate-limit.js";

// Browser resources go through the same pinned public-only fetch path as HTML.
export default async function handler(req, res, deps = {}) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("content-security-policy", "default-src 'none'; sandbox");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.statusCode = 405;
    return res.end();
  }
  const params = new URL(req.url, "http://localhost").searchParams;
  const url = params.get("url");
  const asset = params.get("asset") === "1";
  if (!url) { res.statusCode = 400; return res.end(); }
  const limit = (deps.rateLimit ?? imageLimit)(req);
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfter));
    res.statusCode = 429;
    return res.end();
  }
  try {
    let { body, contentType, finalUrl } = await (asset ? (deps.fetchAsset ?? fetchAsset) : (deps.fetchImage ?? fetchImage))(url);
    if (asset && /^text\/css(?:;|$)/i.test(contentType)) {
      body = rewriteCss(new TextDecoder().decode(body), finalUrl || url);
      contentType = "text/css; charset=utf-8";
      res.setHeader("vary", "Accept-Encoding");
      const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;\s*q=(0(?:\.\d+)?|1(?:\.0+)?))?\s*(?=,|$)/i.exec(req.headers?.["accept-encoding"] || "");
      if (Buffer.byteLength(body) > 64 * 1024 && acceptsGzip && (acceptsGzip[1] === undefined || Number(acceptsGzip[1]) > 0)) {
        body = gzipSync(body);

      }
      // Stay below the hosting platform's function response limit, even for
      // incompressible input or clients that do not accept compression.
      if (Buffer.byteLength(body) > 4 * 1024 * 1024) throw new FetchError("That stylesheet is too big to serve.", 413);
      if (Buffer.isBuffer(body)) res.setHeader("content-encoding", "gzip");
    }
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "public, max-age=300, s-maxage=86400");
    res.statusCode = 200;
    return res.end(body);
  } catch (err) {
    res.statusCode = err instanceof FetchError ? err.status : 500;
    return res.end();
  }
}
