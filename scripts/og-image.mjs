// Renders the social share image (og:image / twitter:image) from the site's
// sun logo: public/og-image.png, 1200x630, in the same style as the store marquee.
// Needs Playwright with Chromium: `npm i --no-save playwright` or a global install.
import fs from "node:fs";
import { chromium } from "playwright";

const url = (p) => new URL(`../${p}`, import.meta.url);
const svg = fs.readFileSync(url("public/favicon.svg"), "utf8").replace("<svg ", '<svg width="240" height="240" ');

const html = `
<style>html,body{margin:0}</style>
<div style="width:1200px;height:630px;box-sizing:border-box;background:#f6f3ea;display:flex;flex-direction:column;justify-content:center;padding-bottom:64px;font-family:system-ui,-apple-system,sans-serif;color:#1f2a24;position:relative">
  <div style="display:flex;align-items:center;justify-content:center;gap:72px">
    ${svg}
    <div>
      <div style="font-weight:700;font-size:112px;line-height:1;letter-spacing:-0.01em">de<span style="text-decoration:line-through;text-decoration-color:#2f6b4f;text-decoration-thickness:9px;color:#5d6a62">doom</span>ify</div>
      <div style="font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:52px;margin-top:22px">AI news, minus the doom.</div>
      <div style="font-size:38px;color:#5d6a62;margin-top:22px"><s style="text-decoration-color:#a8452f;text-decoration-thickness:3px">is misaligned</s> → <mark style="background:#fff0a0;color:#3a2e00;border-radius:6px;padding:0 6px">has a bug</mark></div>
    </div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:64px;background:#2f6b4f;color:#fffdf7;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;letter-spacing:0.02em">dedoomify.com</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: "light" });
await page.setContent(html);
await page.screenshot({ path: url("public/og-image.png").pathname });
await browser.close();
console.log("Wrote public/og-image.png");
