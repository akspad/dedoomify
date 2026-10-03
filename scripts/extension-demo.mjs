// Records the browser extension demo for the README: a made-up article
// (store/demo-article.html) in a browser-style window, the toolbar popup
// opened, "De-doom this page" clicked, and a highlight hovered. The popup and
// content scripts are the real ones from extension/, with the chrome.* APIs
// stubbed to run them in the article frame.
// Writes docs/extension-demo.gif and docs/extension-demo.mp4.
// Needs Playwright with Chromium (`npm i --no-save playwright`; set CHROMIUM_PATH
// to use another Chromium build) and ffmpeg.
// Run `npm run build:extension` first so the extension has the latest rules.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const W = 1280;
const H = 732; // 52px toolbar + 680px page

const stage = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; background: #fff; }
  .bar { height: 52px; background: #eef0ee; border-bottom: 1px solid #d6d9d6; display: flex; align-items: center; gap: 12px; padding: 0 16px; box-sizing: border-box; }
  .dots { display: flex; gap: 7px; } .dots i { width: 12px; height: 12px; border-radius: 50%; }
  .url { flex: 1; margin-left: 12px; height: 32px; border-radius: 16px; background: #fff; border: 1px solid #d6d9d6; display: flex; align-items: center; padding: 0 16px; color: #555; font-size: 14px; }
  #button { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  #button.on { background: #d9ded9; }
  #article { display: block; width: 100%; height: 680px; border: 0; }
  #popup { position: absolute; right: 14px; top: 58px; width: 300px; height: 420px; border: 0; border-radius: 12px; background: #fff;
    box-shadow: 0 14px 40px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.08); display: none; }
  #cursor { position: absolute; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; z-index: 10; }
</style></head><body>
  <div class="bar">
    <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    <span class="url">dailycircuit.example/ai/rogue-ai-warning</span>
    <span id="button"><img src="/extension/icons/32.png" width="22" height="22"></span>
  </div>
  <iframe id="article" src="/store/demo-article.html"></iframe>
  <iframe id="popup"></iframe>
  <svg id="cursor" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>
</body></html>`;

const server = http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/") {
      res.setHeader("content-type", types[".html"]);
      return res.end(stage);
    }
    const file = path.join(root, path.normalize(pathname));
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    res.end(fs.readFileSync(file));
  })
  .listen(0);
const origin = `http://localhost:${server.address().port}`;

const tmp = path.join(root, "dist", "demo-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light", recordVideo: { dir: tmp, size: { width: W, height: H } } });

// In the popup frame, chrome.* runs the extension's files in the article frame.
await context.addInitScript(() => {
  if (!location.pathname.endsWith("/extension/popup.html")) return;
  const page = () => parent.document.getElementById("article").contentWindow;
  const run = async (files) => {
    let result;
    for (const file of files) result = page().eval(await (await fetch(`/extension/${file}`)).text());
    return result;
  };
  window.chrome = {
    tabs: { query: async () => [{ id: 1, url: "https://dailycircuit.example/ai/rogue-ai-warning" }] },
    permissions: { contains: async () => false, request: async () => false, remove: async () => true },
    scripting: {
      insertCSS: async ({ files }) => {
        for (const file of files) {
          const link = page().document.createElement("link");
          link.rel = "stylesheet";
          link.href = `/extension/${file}`;
          page().document.head.append(link);
        }
      },
      executeScript: async ({ files, func, args = [] }) => [{ result: files ? await run(files) : page().eval(`(${func})(...${JSON.stringify(args)})`) }],
    },
  };
});

const page = await context.newPage();
await page.goto(origin);
await page.frameLocator("#article").locator("h1").waitFor();

let at = { x: 640, y: 460 };
const cursor = (p) => page.evaluate(({ x, y }) => { document.getElementById("cursor").style.transform = `translate(${x - 3}px, ${y - 2}px)`; }, p);
async function moveTo(x, y, steps = 24) {
  const from = at;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const p = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(p.x, p.y);
    await cursor(p);
    await page.waitForTimeout(16);
  }
  at = { x, y };
}
const centre = async (locator) => {
  const box = await locator.boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
};

await cursor(at);
await page.waitForTimeout(1400);

// Open the popup from the toolbar button.
await moveTo(...(await centre(page.locator("#button"))));
await page.waitForTimeout(250);
await page.evaluate(() => {
  document.getElementById("button").classList.add("on");
  const popup = document.getElementById("popup");
  popup.src = "/extension/popup.html";
  popup.style.display = "block";
});
const popup = page.frameLocator("#popup");
const fitPopup = () => page.evaluate(() => {
  const frame = document.getElementById("popup");
  frame.style.height = `${frame.contentDocument.documentElement.scrollHeight}px`;
});
await popup.locator("#run").waitFor();
await fitPopup();
await page.waitForTimeout(900);

// De-doom the page.
await moveTo(...(await centre(popup.locator("#run"))));
await page.waitForTimeout(300);
await popup.locator("#run").click();
await popup.locator("#result").waitFor();
await fitPopup();
await page.waitForTimeout(2000);

// Close the popup and hover a highlight to see the original words.
await moveTo(700, 300, 20);
await page.evaluate(() => {
  document.getElementById("popup").style.display = "none";
  document.getElementById("button").classList.remove("on");
});
await page.waitForTimeout(500);
const mark = page.frameLocator("#article").locator("mark.dedoomify", { hasText: "malfunctioning AI" }).first();
await moveTo(...(await centre(mark)), 30);
await page.waitForTimeout(2600);
await moveTo(...(await centre(page.frameLocator("#article").locator("mark.dedoomify", { hasText: "estimated failure rate" }).first())), 30);
await page.waitForTimeout(2600);

const video = await page.video().path();
await context.close();
await browser.close();
server.close();

const docs = path.join(root, "docs");
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
// Trim the blank first moments of the recording.
ff("-ss", "0.6", "-i", video, "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", path.join(docs, "extension-demo.mp4"));
ff("-i", path.join(docs, "extension-demo.mp4"), "-vf", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", path.join(docs, "extension-demo.gif"));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("Wrote docs/extension-demo.mp4 and docs/extension-demo.gif");
