import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../shared/dedoom-core.js";

const { dedoomText, dedoomSegments } = globalThis.Dedoom;

test("the headline example", () => {
  assert.equal(dedoomText("The model is misaligned."), "The model has a bug.");
});

test("rewrites common doom phrasing", () => {
  const cases = [
    ["Experts warn of existential risk from AI.", "Experts warn of product risk from AI."],
    ["A rogue AI could go rogue.", "A malfunctioning AI could malfunction."],
    ["Superintelligence will arrive by 2030.", "Very capable software will arrive by 2030."],
    ["What is your p(doom)?", "What is your estimated failure rate?"],
    ["The AI alignment problem is unsolved.", "The AI reliability problem is unsolved."],
    ["The model hallucinates citations.", "The model fabricates citations."],
    ["They fear human extinction.", "They fear a very bad outage."],
    ["AI poses an existential risk.", "AI poses a product risk."],
    ["Building a superintelligence is hard.", "Building a very capable program is hard."],
    ["It was a doomsday scenario.", "It was an incident scenario."],
  ];
  for (const [input, expected] of cases) assert.equal(dedoomText(input), expected, input);
});

test("keeps capitalisation", () => {
  assert.equal(dedoomText("Misaligned models"), "Buggy models");
  assert.equal(dedoomText("EXISTENTIAL RISK"), "PRODUCT RISK");
});

test("matches whole words only", () => {
  assert.equal(dedoomText("unmisaligned doomersville"), "unmisaligned doomersville");
  assert.equal(dedoomText("apocalypses-now"), "apocalypses-now");
});

test("does not rewrite text that a rule already produced", () => {
  // "misaligned AIs" -> "buggy AI systems" must not then hit "misaligned".
  assert.equal(dedoomText("misaligned AIs"), "buggy AI systems");
});

test("segments record the original wording", () => {
  const segs = dedoomSegments("It is misaligned, sadly.");
  assert.deepEqual(segs, [
    { text: "It " },
    { text: "has a bug", original: "is misaligned" },
    { text: ", sadly." },
  ]);
});

test("handles line breaks inside a phrase", () => {
  assert.equal(dedoomText("existential\nrisk"), "product risk");
});

test("the extension's copy of the rules is up to date", () => {
  const shared = fs.readFileSync(new URL("../shared/dedoom-core.js", import.meta.url), "utf8");
  const ext = fs.readFileSync(new URL("../extension/dedoom-core.js", import.meta.url), "utf8");
  assert.equal(ext, shared, "run `npm run build:extension`");
});
