// Renders public/favicon.svg into the PNG icon sizes the extension needs.
// Needs Playwright with Chromium: `npx playwright` or a global install.
import fs from "node:fs";
import { chromium } from "playwright";
const svg = fs.readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../extension/icons/${size}.png`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
