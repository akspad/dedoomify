import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../shared/dedoom-core.js";
import "../extension/dedoomify-page.js";

const ext = (p) => new URL(`../extension/${p}`, import.meta.url);
const manifest = JSON.parse(fs.readFileSync(ext("manifest.json"), "utf8"));

test("the manifest meets the stores' basic rules", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
  assert.ok(manifest.name.length <= 45, "name is 45 characters at most");
  assert.ok(manifest.description.length <= 132, "description is 132 characters at most");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting"]);
  assert.equal(manifest.host_permissions, undefined, "site access is optional, asked for only by the automatic setting");
  assert.deepEqual(manifest.optional_host_permissions, ["<all_urls>"]);
});

test("every file the extension refers to exists", () => {
  const files = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  const popup = fs.readFileSync(ext("popup.html"), "utf8");
  for (const [, src] of popup.matchAll(/(?:src|href)="([^":]+)"/g)) files.push(src);
  for (const name of ["popup.js", "background.js"]) {
    const script = fs.readFileSync(ext(name), "utf8");
    for (const [, file] of script.matchAll(/"([\w-]+\.(?:js|css))"/g)) files.push(file);
  }
  for (const file of files) assert.ok(fs.existsSync(ext(file)), `${file} is in extension/`);
});

test("the extension loads no remote code", () => {
  for (const file of fs.readdirSync(ext(""))) {
    if (!/\.(js|html)$/.test(file)) continue;
    const source = fs.readFileSync(ext(file), "utf8");
    assert.doesNotMatch(source, /<script[^>]+src="https?:/, file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|importScripts\(/, file);
  }
});

const { looksDoomy } = globalThis.DedoomifyPage;

test("automatic mode picks out articles with AI doom", () => {
  assert.ok(looksDoomy("Experts warn a rogue AI could wipe out humanity."));
  assert.ok(looksDoomy("The chatbot is misaligned, researchers say."));
  assert.ok(looksDoomy("What's your p(doom)? Superintelligence is coming, says OpenAI."));
  assert.ok(looksDoomy("In a test, the AI blackmailed the engineer."));
});

test("automatic mode leaves other pages alone", () => {
  assert.ok(!looksDoomy("Our new AI assistant helps you write emails faster."), "AI without doom");
  assert.ok(!looksDoomy("The asteroid could cause the extinction of the dinosaurs' rivals."), "doom words without AI");
  assert.ok(!looksDoomy("Said the maid: the rain in Spain is plain doom for picnics."), "lowercase 'ai' inside words isn't AI");
  assert.ok(!looksDoomy(""));
});

test("automatic mode judges a long page quickly", () => {
  const filler = "The quarterly report shows steady growth in the widget market across regions. ".repeat(400);
  const start = performance.now();
  for (let i = 0; i < 100; i++) looksDoomy(filler);
  const perPage = (performance.now() - start) / 100;
  assert.ok(perPage < 5, `took ${perPage.toFixed(2)} ms per page`);
});
