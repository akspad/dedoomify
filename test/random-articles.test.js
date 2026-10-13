import test from "node:test";
import assert from "node:assert/strict";
import { createArticlePicker } from "../public/random-articles.js";

const urls = ["https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d"];
function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("each article appears exactly once per cycle", () => {
  const picker = createArticlePicker(urls, { random: () => 0.99 });
  let current;
  for (let cycle = 0; cycle < 4; cycle++) {
    const selected = [];
    for (let i = 0; i < urls.length; i++) {
      const next = picker.next(current);
      assert.notEqual(next, current);
      selected.push(next);
      current = next;
    }
    assert.deepEqual(selected.slice().sort(), urls.slice().sort());
  }
});

test("the first demo is shown once and reloads continue the saved cycle", () => {
  const storage = memoryStorage();
  const first = createArticlePicker(urls, { storage, random: () => 0.99 });
  assert.equal(first.next(), urls[0]);
  const second = createArticlePicker(urls, { storage, random: () => 0.99 });
  const remaining = [second.next(), second.next(), second.next()];
  assert.deepEqual(remaining.slice().sort(), urls.slice(1).sort());
});

test("a new cycle never immediately repeats its last article", () => {
  const storage = memoryStorage();
  const picker = createArticlePicker(urls, { storage, random: () => 0.99 });
  let last;
  for (let i = 0; i < urls.length; i++) last = picker.next(last);
  const reloaded = createArticlePicker(urls, { storage, random: () => 0 });
  assert.notEqual(reloaded.next(last), last);
});

test("curated shared or pasted articles count as already seen", () => {
  const storage = memoryStorage();
  createArticlePicker(urls, { storage }).remember(urls[0]);
  const picker = createArticlePicker(urls, { storage, random: () => 0 });
  assert.equal(picker.next(), urls[1]);
  assert.equal(picker.next(urls[2]), urls[3]);
});

test("other tabs share the current cycle and its exhaustion", () => {
  const storage = memoryStorage();
  const a = createArticlePicker(urls, { storage, random: () => 0 });
  const b = createArticlePicker(urls, { storage, random: () => 0 });
  assert.equal(a.next(), urls[0]);
  assert.equal(b.next(), urls[1]);
  assert.equal(a.next(), urls[2]);
  assert.equal(b.next(), urls[3]);
  assert.equal(a.next(urls[3]), urls[0]);
  assert.equal(b.next(urls[0]), urls[1]);
});

test("adding articles keeps prior history; removed entries do not block new URLs", () => {
  const storage = memoryStorage();
  const old = createArticlePicker(urls.slice(0, 2), { storage });
  old.next(); old.next();
  assert.equal(createArticlePicker(urls.slice(0, 3), { storage }).next(), urls[2]);
  assert.equal(createArticlePicker([urls[1], urls[3]], { storage }).next(), urls[3]);
});

test("blocked reads or quota errors retain repeat prevention in memory", () => {
  for (const storage of [undefined,
    { getItem() { throw new Error("blocked"); }, setItem() {} },
    { getItem() { return null; }, setItem() { throw new Error("quota"); } },
  ]) {
    const picker = createArticlePicker(urls, { storage, random: () => 0 });
    assert.deepEqual(urls.map(() => picker.next()), urls);
  }
});

test("corrupt or invalid stored history is repaired and remains persistent", () => {
  for (const saved of ["{", '{"not":"a list"}', JSON.stringify([urls[0], 42, null, "unknown"])]) {
    const storage = memoryStorage();
    storage.data.set("dedoomify.article-history", saved);
    const picker = createArticlePicker(urls, { storage, random: () => 0 });
    const next = picker.next();
    const reloaded = createArticlePicker(urls, { storage, random: () => 0 });
    assert.notEqual(reloaded.next(), next);
  }
});

test("arbitrary pasted URLs are never saved", () => {
  const storage = memoryStorage();
  const picker = createArticlePicker(urls, { storage });
  picker.remember("https://private.example/path?secret=123");
  assert.equal(storage.data.size, 0);
  picker.next("https://private.example/path?secret=123");
  assert.deepEqual(JSON.parse([...storage.data.values()][0]), [urls[0]]);
});

test("empty and single-article lists terminate safely; duplicate URLs count once", () => {
  assert.equal(createArticlePicker([]).next(), null);
  const one = createArticlePicker([urls[0], urls[0]]);
  assert.equal(one.next(), urls[0]);
  assert.equal(one.next(urls[0]), urls[0]);
});
