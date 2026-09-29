// Local stand-in for Vercel: serves public/ and routes /api/dedoom.
// Usage: npm run dev  (set ANTHROPIC_API_KEY to try the Claude rewrite)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/dedoom.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT) || 3000;
// Send the same security headers Vercel does, so problems show up locally.
const vercel = JSON.parse(await fs.readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const siteHeaders = vercel.headers.flatMap((rule) => rule.headers);

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    for (const { key, value } of siteHeaders) res.setHeader(key, value);
    if (pathname === "/api/dedoom") return handler(req, res);
    const file = path.join(root, pathname === "/" ? "index.html" : path.normalize(pathname));
    if (!file.startsWith(root)) {
      res.statusCode = 403;
      return res.end();
    }
    try {
      const body = await fs.readFile(file);
      res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  })
  .listen(port, () => console.log(`dedoomify running at http://localhost:${port}`));
