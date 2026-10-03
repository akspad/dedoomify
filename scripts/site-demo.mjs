// Records the homepage demo clip: a real article's link is pasted, the page
// comes back with its doom phrases highlighted in place, and hovering a
// highlight shows the original words.
// Writes public/demo.mp4, public/demo.webm, public/demo-poster.jpg and
// docs/demo.gif (for the README).
// Needs Playwright with Chromium (`npm i --no-save playwright`; set CHROMIUM_PATH
// to use another Chromium build), ffmpeg, and network access to the article.
// Starts the local dev server (run `npm run build` first) unless SITE is set,
// e.g. SITE=https://dedoomify.com to record the live site.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLE =
  process.env.ARTICLE ||
  "https://techcrunch.com/2026/09/28/openai-still-doesnt-seem-to-have-a-handle-on-all-of-its-rogue-ai-activity/";
const W = 1100;
const H = 704;

let server = null;
let site = process.env.SITE;
if (!site) {
  const port = 4300 + Math.floor(Math.random() * 500);
  server = spawn(process.execPath, [path.join(root, "scripts/dev-server.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  site = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(site); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
}

const tmp = path.join(root, "dist", "demo-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: "light",
  bypassCSP: true,
  recordVideo: { dir: tmp, size: { width: W, height: H } },
});
const page = await context.newPage();
await page.goto(site);
// A drawn cursor, since the recording doesn't show the real one.
const addCursor = () => page.evaluate(() => {
  if (document.getElementById("demo-cursor")) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.id = "demo-cursor";
  svg.setAttribute("viewBox", "0 0 22 22");
  svg.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;pointer-events:none;z-index:2147483647";
  svg.innerHTML = '<path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>';
  document.body.append(svg);
});
await addCursor();

let at = { x: 700, y: 120 };
const cursor = (p) => page.evaluate(({ x, y }) => { document.getElementById("demo-cursor").style.transform = `translate(${x - 3}px, ${y - 2}px)`; }, p);
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
await page.waitForTimeout(1200);

// Paste the link and de-doom it.
const input = page.locator("#url");
await input.scrollIntoViewIfNeeded();
await moveTo(...(await centre(input)));
await input.click();
await page.waitForTimeout(250);
await input.fill(ARTICLE);
await page.waitForTimeout(700);
await moveTo(...(await centre(page.locator("#go"))));
await page.waitForTimeout(250);
await page.locator("#go").click();
const frame = page.frameLocator("#page");
await frame.locator("mark.dd").first().waitFor({ timeout: 45_000 });
await page.waitForTimeout(1800);

// Hover a highlight to see the original words, then read on.
const marks = frame.locator("mark.dd");
const hover = async (mark) => {
  await mark.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await moveTo(...(await centre(mark)), 30);
  await page.waitForTimeout(2400);
};
const title = frame.locator("h1 mark.dd").first();
await hover((await title.count()) ? title : marks.first());
await moveTo(W - 120, H - 140, 20);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 90);
  await page.waitForTimeout(110);
}
await page.waitForTimeout(800);
const visible = await marks.evaluateAll((els) => els.findIndex((el) => {
  const r = el.getBoundingClientRect();
  return r.top > 140 && r.bottom < innerHeight - 60;
}));
if (visible >= 0) await hover(marks.nth(visible));

const video = await page.video().path();
await context.close();
await browser.close();
server?.kill();

const out = (...p) => path.join(root, ...p);
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
// Trim the blank first moments of the recording.
ff("-ss", "0.6", "-i", video, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out("public", "demo.mp4"));
ff("-i", out("public", "demo.mp4"), "-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-an", out("public", "demo.webm"));
ff("-ss", "9", "-i", out("public", "demo.mp4"), "-frames:v", "1", "-q:v", "4", out("public", "demo-poster.jpg"));
ff("-i", out("public", "demo.mp4"), "-vf", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", out("docs", "demo.gif"));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("Wrote public/demo.mp4, public/demo.webm, public/demo-poster.jpg and docs/demo.gif");
