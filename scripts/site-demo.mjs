// Records the homepage demo clip: a real article's link is pasted, the page
// comes back with its doom phrases highlighted in place, and hovering a
// highlight shows the original words.
// Writes public/demo.mp4, public/demo.webm, public/demo-poster.webp and
// docs/demo.gif (for the README).
// Needs Playwright with Chromium (`npm i --no-save playwright`; set CHROMIUM_PATH
// to use another Chromium build), ffmpeg, and network access to the article.
// Starts the local dev server (run `npm run build` first) unless SITE is set,
// e.g. SITE=https://dedoomify.com to record the live site.
// SKIP_ENCODE=1 keeps a lossless Retina master at dist/demo-raw.mkv;
// FROM_RAW=<file> encodes a saved master without recording again.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startCapture, encodeDemo } from "./demo-media.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLE =
  process.env.ARTICLE ||
  "https://techcrunch.com/2026/09/28/openai-still-doesnt-seem-to-have-a-handle-on-all-of-its-rogue-ai-activity/";
// Playback speed of the published clip relative to the recording.
const SPEED = Number(process.env.SPEED) || 1;
const W = 1100;
const H = 704;

async function record() {
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
    deviceScaleFactor: 2,
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
  await page.evaluate(() => document.querySelector("#demo video")?.pause());
  await page.evaluate(() => document.fonts.ready);

  const capture = await startCapture(page, tmp, { reportPath: path.join(root, "dist", "site-demo-motion.json") });
  const moveTo = (x, y, steps = 24) => capture.moveTo(x, y, steps / 30);
  const centre = async (locator) => {
    const box = await locator.boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };

  await capture.cursor({ x: 700, y: 120 });
  await capture.hold(1200);

  // Paste the link and de-doom it.
  const input = page.locator("#url");
  await input.scrollIntoViewIfNeeded();
  await moveTo(...(await centre(input)));
  await input.click();
  await capture.hold(250);
  await input.fill(ARTICLE);
  await capture.hold(700);
  await moveTo(...(await centre(page.locator("#go"))));
  await capture.hold(250);
  await page.locator("#go").click();
  const frame = page.frameLocator("#page");
  await frame.locator("mark.dd").first().waitFor({ timeout: 45_000 });
  await capture.hold(1800);

  // Hover a highlight to see the original words, then read on.
  const marks = frame.locator("mark.dd");
  const hover = async (mark) => {
    await mark.scrollIntoViewIfNeeded();
    await capture.hold(400);
    await moveTo(...(await centre(mark)), 30);
    await capture.hold(2400);
  };
  const title = frame.locator("h1 mark.dd").first();
  await hover((await title.count()) ? title : marks.first());
  await moveTo(W - 120, H - 140, 20);
  for (let i = 0; i < 40; i++) {
    await frame.locator("body").evaluate(() => window.scrollBy({ top: 13.5, behavior: "instant" }));
    await capture.frame();
  }
  await capture.hold(800);
  const visible = await marks.evaluateAll((els) => els.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return r.top > 140 && r.bottom < innerHeight - 60;
  }));
  if (visible >= 0) await hover(marks.nth(visible));

  const recording = await capture.finish();
  await context.close();
  await browser.close();
  server?.kill();
  return recording;
}

const video = process.env.FROM_RAW ? path.resolve(process.env.FROM_RAW) : await record();
if (process.env.SKIP_ENCODE) {
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.copyFileSync(video, path.join(root, "dist", "demo-raw.mkv"));
  fs.rmSync(path.join(root, "dist", "demo-tmp"), { recursive: true, force: true });
  console.log("Wrote dist/demo-raw.mkv");
  process.exit(0);
}
const out = (...p) => path.join(root, ...p);
encodeDemo(video, {
  mp4: out("public", "demo.mp4"),
  webm: out("public", "demo.webm"),
  gif: out("docs", "demo.gif"),
  poster: out("public", "demo-poster.webp"),
  speed: SPEED,
});
fs.rmSync(path.join(root, "dist", "demo-tmp"), { recursive: true, force: true });
console.log("Wrote Retina MP4/WebM, high-quality WebP poster and README GIF");
