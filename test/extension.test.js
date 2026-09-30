import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ext = (p) => new URL(`../extension/${p}`, import.meta.url);
const manifest = JSON.parse(fs.readFileSync(ext("manifest.json"), "utf8"));

test("the manifest meets the stores' basic rules", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
  assert.ok(manifest.name.length <= 45, "name is 45 characters at most");
  assert.ok(manifest.description.length <= 132, "description is 132 characters at most");
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting"]);
  assert.equal(manifest.host_permissions, undefined, "no host permissions");
});

test("every file the extension refers to exists", () => {
  const files = [
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  const popup = fs.readFileSync(ext("popup.html"), "utf8");
  for (const [, src] of popup.matchAll(/(?:src|href)="([^":]+)"/g)) files.push(src);
  const script = fs.readFileSync(ext("popup.js"), "utf8");
  for (const [, file] of script.matchAll(/"([\w-]+\.(?:js|css))"/g)) files.push(file);
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
