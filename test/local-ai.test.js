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
    "The chatbot produced false output to users about its capabilities.",
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
