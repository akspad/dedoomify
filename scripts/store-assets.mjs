// Renders the extension's icons and the store images from the site's sun logo
// (public/favicon.svg) and a made-up article (store/demo-article.html):
//   extension/icons/{16,32,48,128}.png   toolbar and extension-page icons
//   store/icons/                         store and App Store icons
//   store/screenshots/*.png              1280x800 screenshots for all three stores
//   store/promo-440x280.png, store/marquee-1400x560.png
// Needs Playwright with Chromium: `npm i --no-save playwright` or a global install.
// Run `npm run build:extension` first so the extension has the latest rules.
import fs from "node:fs";
import { chromium } from "playwright";

const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => fs.readFileSync(url(p), "utf8");
const out = (p) => {
  fs.mkdirSync(new URL(".", url(p)), { recursive: true });
  return url(p).pathname;
};
const dataUrl = (p) => `data:image/png;base64,${fs.readFileSync(url(p)).toString("base64")}`;
const svg = read("public/favicon.svg");
const sized = (size) => svg.replace("<svg ", `<svg width="${size}" height="${size}" `);

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, width, height, path, { transparent = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>html,body{margin:0;${transparent ? "background:transparent" : ""}}</style>${html}`);
  await page.screenshot({ path: out(path), omitBackground: transparent });
}

// Icons. The Chrome Web Store asks for 96x96 artwork inside a 128x128 canvas.
for (const size of [16, 32, 48, 128]) await render(sized(size), size, size, `extension/icons/${size}.png`, { transparent: true });
for (const size of [256, 512]) await render(sized(size), size, size, `store/icons/icon-${size}.png`, { transparent: true });
await render(`<div style="padding:16px">${sized(96)}</div>`, 128, 128, "store/icons/chrome-store-128.png", { transparent: true });
await render(`<div style="padding:20px">${sized(260)}</div>`, 300, 300, "store/icons/edge-logo-300.png", { transparent: true });
// The App Store icon must be square, full bleed and opaque; Apple rounds the corners.
await render(sized(1024).replace('rx="14"', 'rx="0"'), 1024, 1024, "store/icons/app-icon-1024.png");

// The popup, drawn in a given state with the extension APIs stubbed out.
async function popup(state) {
  const p = await browser.newPage({ viewport: { width: 300, height: 400 }, colorScheme: "light", deviceScaleFactor: 1 });
  await p.addInitScript((state) => {
    const tab = { id: 1, url: "https://example.com/ai-news" };
    window.chrome = {
      tabs: { query: async () => [tab] },
      scripting: { executeScript: async () => [{ result: state }], insertCSS: async () => {} },
      permissions: { contains: async () => false },
    };
  }, state);
  await p.goto(url("extension/popup.html").href);
  await p.waitForTimeout(100);
  const shot = await p.locator("body").screenshot({ path: out(`dist/store-tmp/popup-${state ? "after" : "before"}.png`) });
  await p.close();
  return shot;
}
await popup(null);
await popup({ total: 12, shown: true });

// The demo article, before and after, with the real content script applied.
async function article(path, { dedoom = false, hover = null } = {}) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  await p.goto(url("store/demo-article.html").href);
  if (dedoom) {
    await p.addStyleTag({ content: read("extension/content.css") });
    await p.addScriptTag({ content: read("extension/dedoom-core.js") });
    await p.addScriptTag({ content: read("extension/dedoomify-page.js") });
    await p.addScriptTag({ content: read("extension/content.js") });
  }
  if (hover) await p.hover(hover);
  await p.screenshot({ path: out(path) });
  await p.close();
}
await article("dist/store-tmp/before.png");
await article("dist/store-tmp/after.png", { dedoom: true, hover: "text=estimated failure rate" });

// Screenshots: the page with a browser-style toolbar and the popup open under the extension's button.
function frame(shot, popupShot, caption) {
  return `
  <div style="width:1280px;height:800px;position:relative;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;background:#fff">
    <div style="height:52px;background:#eef0ee;border-bottom:1px solid #d6d9d6;display:flex;align-items:center;gap:12px;padding:0 16px;box-sizing:border-box">
      <span style="display:flex;gap:7px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i></span>
      <span style="flex:1;margin-left:12px;height:32px;border-radius:16px;background:#fff;border:1px solid #d6d9d6;display:flex;align-items:center;padding:0 16px;color:#555;font-size:14px">dailycircuit.example/ai/rogue-ai-warning</span>
      <img src="${dataUrl("extension/icons/32.png")}" width="22" height="22" style="border-radius:5px;outline:2px solid #2f6b4f;outline-offset:3px">
    </div>
    <img src="${dataUrl(shot)}" width="1280" height="800" style="display:block">
    ${caption ? `<div style="position:absolute;left:40px;bottom:32px;background:#1f2a24;color:#f3f5f2;border-radius:12px;padding:14px 20px;font-size:20px;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,.25)">${caption}</div>` : ""}
    ${popupShot ? `<img src="${dataUrl(popupShot)}" style="position:absolute;right:14px;top:58px;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.08)">` : ""}
  </div>`;
}
await render(frame("dist/store-tmp/before.png", "dist/store-tmp/popup-before.png", "Click once on any article about AI"), 1280, 800, "store/screenshots/1-before.png");
await render(frame("dist/store-tmp/after.png", "dist/store-tmp/popup-after.png", "Doom framing becomes plain engineering language"), 1280, 800, "store/screenshots/2-after.png");
await render(frame("dist/store-tmp/after.png", null, "Hover a highlight to see the original words"), 1280, 800, "store/screenshots/3-hover.png");

// Promo tiles.
function promo(width, height, logo, title, sub) {
  return `
  <div style="width:${width}px;height:${height}px;background:#f6f3ea;display:flex;align-items:center;justify-content:center;gap:${logo / 3}px;font-family:system-ui,-apple-system,sans-serif;color:#1f2a24">
    ${sized(logo)}
    <div>
      <div style="font-weight:700;font-size:${logo * 0.42}px;letter-spacing:-0.01em">de<span style="text-decoration:line-through;text-decoration-color:#2f6b4f;text-decoration-thickness:${logo / 30}px;color:#5d6a62">doom</span>ify</div>
      <div style="font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:${logo * 0.2}px;margin-top:${logo / 20}px">${title}</div>
      <div style="font-size:${logo * 0.14}px;color:#5d6a62;margin-top:${logo / 16}px">${sub}</div>
    </div>
  </div>`;
}
const example = `<s style="text-decoration-color:#a8452f">is misaligned</s> → <mark style="background:#fff0a0;color:#3a2e00;border-radius:4px;padding:0 3px">has a bug</mark>`;
await render(promo(440, 280, 92, "AI news, minus the doom.", example), 440, 280, "store/promo-440x280.png");
await render(promo(1400, 560, 260, "AI news, minus the doom.", example), 1400, 560, "store/marquee-1400x560.png");

await browser.close();
fs.rmSync(url("dist/store-tmp/"), { recursive: true, force: true });
console.log("Wrote extension/icons/, store/icons/, store/screenshots/ and the promo tiles");
