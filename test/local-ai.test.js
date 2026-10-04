import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../shared/dedoom-prompt.js";
import "../shared/dedoom-core.js";
import { acceptRewrite, buildMessages, cleanOutput, needsModel, MODELS, DEFAULT_MODEL } from "../public/local-ai.js";

test("only paragraphs with doom framing go to the model", () => {
  assert.ok(needsModel("The model is misaligned.", "The model has a bug."));
  assert.ok(needsModel("The AI decided to deceive its users.", "The AI decided to deceive its users."));
  assert.ok(!needsModel("Revenue rose 12 percent.", "Revenue rose 12 percent."));
});

test("strips labels and quotes the model adds", () => {
  assert.equal(cleanOutput("It has a bug.", 'Rewritten paragraph: "It has a bug."'), "It has a bug.");
  assert.equal(cleanOutput('"Quote," she said.', '"Quote," she said.'), '"Quote," she said.');
});

test("rejects rewrites that change the facts or the shape", () => {
  const original = "In 2025, 40 percent of researchers said AI could cause human extinction.";
  assert.ok(acceptRewrite(original, "In 2025, 40 percent of researchers said AI could cause a very bad outage."));
  assert.ok(!acceptRewrite(original, "In 2024, 40 percent of researchers said AI could cause a very bad outage."));
  assert.ok(!acceptRewrite(original, "Researchers worry."));
  assert.ok(!acceptRewrite(original, original + "\n\nAlso, here is a note."));
  assert.ok(!acceptRewrite(original, ""));
});

test("rejects rewrites that change semantic invariants or actor order", () => {
  const cases = [
    ["Some researchers said the AI could cause human extinction.", "All researchers said the AI will cause human extinction."],
    ["The model did not deceive users.", "The model did deceive users."],
    ["The model deceived Carol before it deceived David.", "The model deceived David before it deceived Carol."],
    ["Claude showed deception in 10% of runs; Gemini showed deception in 20%.", "Claude showed misleading output in 20% of runs; Gemini showed misleading output in 10%."],
    ["Researchers saw deception in 10% of runs.", "Researchers saw misleading output in 10% to 20% of runs."],
  ];
  for (const [original, rewritten] of cases) {
    assert.ok(!acceptRewrite(original, rewritten), rewritten);
  }
});

test("leaves direct quotations byte-for-byte unchanged", () => {
  const original = "She said, \u201cThe model is misaligned.\u201d The model is misaligned.";
  assert.ok(acceptRewrite(original, "She said, \u201cThe model is misaligned.\u201d The model has a bug."));
  assert.ok(!acceptRewrite(original, "She said, \u201cThe model has a bug.\u201d The model has a bug."));
});

test("does not send ambiguous non-AI prose to the model", () => {
  assert.ok(!needsModel("The patient reported hallucinations after taking the medication.", "The patient reported hallucinations after taking the medication."));
  assert.ok(!needsModel("Researchers used deception in the human control group.", "Researchers used deception in the human control group."));
});

test("rejects rewrites that invent or drop details", () => {
  // Real outputs from Qwen2.5 0.5B that got facts wrong.
  assert.ok(!acceptRewrite(
    "In the test, the AI decided to blackmail an engineer to avoid being shut down, researchers said.",
    "In the test, the AI produced false output and was optimized to exploit a scoring bug in the test.",
  ));
  assert.ok(!acceptRewrite(
    "The chatbot lied to users about its capabilities and schemed to escape its sandbox.",
    "The AI went on to deceive its creators and schemed to run outside the sandbox.",
  ));
});

test("rejects rewrites that drop, add or restyle quotation marks", () => {
  const original = "\u201cThe model is misaligned,\u201d she said, calling it \"rogue.\"";
  assert.ok(acceptRewrite(original, "\u201cThe model has a bug,\u201d she said, calling it \"rogue.\""));
  assert.ok(!acceptRewrite(original, "The model has a bug, she said, calling it \"rogue.\""));
  assert.ok(!acceptRewrite(original, "\"The model has a bug,\" she said, calling it \"rogue.\""));
  assert.ok(!acceptRewrite("The model is misaligned, she said.", "\"The model has a bug,\" she said."));
});

test("rejects rewrites that add, drop or change periods", () => {
  const original = "The model is misaligned. Dr. Lee said so.";
  assert.ok(acceptRewrite(original, "The model has a bug. Dr. Lee said so."));
  assert.ok(!acceptRewrite(original, "The model has a bug. Dr Lee said so."));
  assert.ok(!acceptRewrite(original, "The model has a bug, Dr. Lee said so."));
  assert.ok(!acceptRewrite(original, "The model has a bug. Dr. Lee said so"));
  assert.ok(!acceptRewrite(original, "The model has a bug! Dr. Lee said so."));
  assert.ok(!acceptRewrite("The model is misaligned", "The model has a bug."));
});

test("accepts rewrites that only change the doom framing", () => {
  assert.ok(acceptRewrite(
    "Experts warn the model is misaligned and could go rogue by 2030.",
    "Experts warn that the model has a bug and could go rogue by 2030.",
  ));
  assert.ok(acceptRewrite(
    "Critics said the AI decided to deceive its creators.",
    "Critics said the AI produced misleading output for its creators.",
  ));
  assert.ok(acceptRewrite(
    "The chatbot lied to users about its capabilities.",
    "The chatbot gave wrong answers to users about its capabilities.",
  ));
});

test("the model gets the shared style guide and the paragraph last", () => {
  const messages = buildMessages(globalThis.DedoomPrompt.STYLE_GUIDE, "The model is misaligned.");
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /the model has a bug/);
  assert.match(messages[0].content, /only the rewritten paragraph/);
  assert.deepEqual(messages.at(-1), { role: "user", content: "The model is misaligned." });
});

test("every model build is one WebLLM ships", () => {
  const lib = fs.readFileSync(new URL("../node_modules/@mlc-ai/web-llm/lib/index.js", import.meta.url), "utf8");
  assert.ok(MODELS[DEFAULT_MODEL]);
  for (const model of Object.values(MODELS)) {
    for (const id of Object.values(model.ids)) assert.ok(lib.includes(`model_id: "${id}"`), id);
  }
});

test("every on-device option in the picker names a known model", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const modes = JSON.parse(app.match(/const LOCAL_MODES = (\{.*\});/)[1].replace(/([\w-]+|"[\w-]+"):/g, (m, k) => `"${k.replace(/"/g, "")}":`));
  for (const [mode, key] of Object.entries(modes)) {
    assert.ok(MODELS[key], key);
    assert.ok(html.includes(`<option value="${mode}">`), mode);
  }
});

test("the picker offers quick phrase rules first, then one on-device option running Qwen", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const options = [...html.matchAll(/<option value="([\w-]+)">([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [["rules", "Quick phrase rules"], ["local", "On-device AI"]]);
  assert.deepEqual(Object.keys(MODELS), ["qwen"]);
  assert.equal(DEFAULT_MODEL, "qwen");
});
