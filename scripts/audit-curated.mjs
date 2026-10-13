// Live smoke audit, deliberately paced below the public endpoint rate limits.
// Usage: node scripts/audit-curated.mjs [report.json] [https://dedoomify.com]
// Requires curl. This checks article content, every linked stylesheet and the
// first two article images; it does not replace visual/mobile browser testing.
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { DOOM_STORIES } from "../public/curated-articles.js";
const exec = promisify(execFile);
const output = process.argv[2] || "/tmp/dedoomify-render-audit.json";
const base = new URL(process.argv[3] || "https://dedoomify.com").origin;
const report = { checkedAt: new Date().toISOString(), base, pages: [], resources: [] };
const resources = new Map();
async function get(url) {
  try {
    const { stdout } = await exec("curl", ["-sSL", "--compressed", "--max-time", "40", "-H", "Sec-Fetch-Dest: iframe", "-w", "\n%{http_code}", url], { maxBuffer: 40 * 1024 * 1024 });
    const split = stdout.lastIndexOf("\n");
    return { status: Number(stdout.slice(split + 1)), body: stdout.slice(0, split) };
  } catch (error) { return { status: 0, body: "", error: error.message.slice(0, 500) }; }
}
async function paced(items, interval, check) {
  const active = new Set();
  for (const item of items) {
    while (active.size >= 3) await Promise.race(active);
    const task = check(item).finally(() => active.delete(task));
    active.add(task);
    await setTimeout(interval);
  }
  await Promise.all(active);
}
function resource(path, kind, article) {
  if (!path?.startsWith("/api/image?")) return;
  const url = base + path;
  const entry = resources.get(url) || { url, kind, articles: [] };
  entry.articles.push(article);
  resources.set(url, entry);
}
await paced(DOOM_STORIES, 2500, async (url) => {
  const { status, body, error } = await get(base + "/api/page?url=" + encodeURIComponent(url));
  const { document } = parseHTML(body);
  const title = document.querySelector("h1")?.textContent.trim() || "";
  for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) resource(link.getAttribute("href"), "stylesheet", url);
  const article = new Readability(document.cloneNode(true), { keepClasses: true }).parse();
  const content = parseHTML(article?.content || "").document;
  for (const img of [...content.querySelectorAll("img[src]")].slice(0, 2)) resource(img.getAttribute("src"), "article-image", url);
  const row = { url, status, title, textLength: article?.textContent?.trim().length || 0, error };
  row.ok = status === 200 && Boolean(title) && row.textLength > 200;
  report.pages.push(row);
  console.log(`${report.pages.length}/${DOOM_STORIES.length} pages: ${row.ok ? "OK" : "CHECK"} ${url}`);
});
await paced([...resources.values()], 700, async (entry) => {
  const { status, body, error } = await get(entry.url);
  report.resources.push({ ...entry, status, nonempty: body.length > 0, ok: status === 200 && body.length > 0, error });
  console.log(`${report.resources.length}/${resources.size} resources: ${status} ${entry.kind}`);
});
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
const failures = [...report.pages, ...report.resources].filter((row) => !row.ok);
console.log(`Checked ${report.pages.length} pages and ${report.resources.length} resources; ${failures.length} need review. Report: ${output}`);
if (failures.length) process.exitCode = 1;
