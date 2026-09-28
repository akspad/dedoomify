import test from "node:test";
import assert from "node:assert/strict";
import "../public/diff.js";

const { diffSegments } = globalThis.DedoomDiff;
const join = (segs) => segs.map((s) => s.text).join("");

test("diff segments always rebuild the rewritten text", () => {
  const cases = [
    ["Experts warn the model is misaligned and could go rogue by 2030.", "Experts warn the model has a bug and could malfunction by 2030."],
    ["a go rogue b", "a malfunction b"],
    ["The model is misaligned.", "The model has a bug."],
    ["a b c d", "a b d"],
    ["a b c", "a b c d"],
    ["toward superintelligence. One", "toward very capable software. One"],
    ["same text", "same text"],
  ];
  for (const [before, after] of cases) assert.equal(join(diffSegments(before, after)), after, before);
});

test("nearby edits are shown as one change", () => {
  assert.deepEqual(diffSegments("The model is misaligned and dangerous.", "The model has a bug and dangerous."), [
    { text: "The model " },
    { text: "has a bug", original: "is misaligned" },
    { text: " and dangerous." },
  ]);
  const segs = diffSegments("could go rogue by 2030.", "could malfunction by 2030.");
  const change = segs.find((s) => s.text === "malfunction");
  assert.equal(change.original, "go rogue");
});
