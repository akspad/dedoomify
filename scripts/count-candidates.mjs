import { fetchHtml } from "../lib/fetch-article.js";
import { renderPage, textToHtml } from "../lib/page.js";
import { readFileSync } from "node:fs";
const urls = readFileSync(new URL("./candidates.txt", import.meta.url), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const out = [];
await Promise.all(urls.map(async (url) => {
  try {
    const { html, finalUrl, contentType } = await fetchHtml(url);
    const source = /text\/plain/i.test(contentType) ? textToHtml(html, finalUrl) : html;
    const r = renderPage(source, finalUrl);
    const words = r.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).length;
    out.push({ changed: r.changed, url, finalUrl, words, title: r.title });
  } catch (err) {
    out.push({ changed: -1, url, error: err.message });
  }
}));
out.sort((a, b) => b.changed - a.changed);
for (const r of out) console.log(JSON.stringify(r));
