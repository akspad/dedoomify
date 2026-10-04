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
  const nested = 'She said, \u201cThey called the model "misaligned" yesterday.\u201d';
  assert.ok(!acceptRewrite(nested, 'She said, \u201cThey called the model "has a bug" yesterday.\u201d'));
  const british = "She said, ‘The model is misaligned.’";
  assert.ok(!acceptRewrite(british, "She said, ‘The model has a bug.’"));
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
  assert.ok(!acceptRewrite(original, "\u201cThe model has a bug,\u201d she said, calling it \"rogue.\""));
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

test("keeps certainty, frequency, direction, comparison, causality and safety", () => {
  const modifiers = [
    ["likely", "unlikely"], ["uncertain", "certain"], ["possible", "impossible"],
    ["always", "sometimes"], ["usually", "rarely"], ["often", "seldom"],
    ["increased", "decreased"], ["rising", "falling"], ["rose", "fell"],
    ["better", "worse"], ["greater", "smaller"], ["safe", "unsafe"],
    ["because", "after"], ["caused", "avoided"], ["led to", "followed"],
    ["resulted in", "prevented"], ["at least", "at most"],
  ];
  for (const [before, after] of modifiers) {
    const original = `Researchers reported ${before} results from the misaligned model.`;
    assert.ok(!acceptRewrite(original, original.replace(before, after)), `${before} -> ${after}`);
    assert.ok(!acceptRewrite(original, original.replace(before + " ", "")), `drop ${before}`);
    assert.ok(acceptRewrite(original, original.replace("misaligned", "buggy")), `keep ${before}`);
  }
});

test("hint words cannot disappear merely because they select a paragraph", () => {
  for (const word of ["killed", "destroyed", "threatened", "escaped", "blackmailed"]) {
    const original = `Researchers said the AI ${word} critical production services.`;
    assert.ok(!acceptRewrite(original, original.replace(word + " ", "")), word);
  }
  assert.ok(!acceptRewrite("A threat report calls the model an existential threat.", "A report calls the model a product risk."));
});

test("model and rules share ASCII speech boundaries including contractions", () => {
  const before = "She said, 'The model isn't misaligned.' The model is misaligned.";
  assert.ok(acceptRewrite(before, before.replace("The model is misaligned.", "The model has a bug.")));
  assert.ok(!acceptRewrite(before, before.replace("isn't misaligned", "has no bug")));
  assert.ok(!acceptRewrite("The model is misaligned.", "'The model has a bug.'"));
  assert.ok(acceptRewrite("The model's output is misaligned.", "The model's output has a bug."));
});

test("keeps plural/name possessives and human deception inside model output", () => {
  for (const quote of ["'The users' feedback is that the model is misaligned.'", "'James' report says the model is misaligned.'"]) {
    const original = `She said, ${quote} Outside it is misaligned.`;
    assert.ok(!acceptRewrite(original, original.replace("model is misaligned", "model has a bug")));
    assert.ok(acceptRewrite(original, original.replace("Outside it is misaligned", "Outside it has a bug")));
  }
  for (const actor of ["The CEO", "Carol", "The researcher", "The user"]) {
    assert.ok(!acceptRewrite(`${actor} decided to deceive customers while discussing AI.`, `${actor} produced misleading output for customers while discussing AI.`), actor);
  }
});

test("protects final-s speech and covers explicitly qualified AI subjects", () => {
  const original = "She wrote, 'Misalignment risks' in her report.";
  assert.ok(!acceptRewrite(original, "She wrote, 'Bug risks' in her report."));
  for (const actor of ["Llama", "GPT-5", "the AI system", "the AI models", "the chatbot", "Claude"]) {
    assert.ok(acceptRewrite(`Critics said ${actor} decided to deceive its creators.`, `Critics said ${actor} produced misleading output for its creators.`), actor);
  }
  const quoted = "She said, 'Llama decided to deceive its creators.' Outside it is misaligned.";
  assert.ok(acceptRewrite(quoted, quoted.replace("Outside it is misaligned", "Outside it has a bug")));
});

test("deception exception rejects ambiguous human/non-AI actors", () => {
  for (const actor of ["The federal agents", "The assistants", "The fashion models", "The accounting systems"]) {
    const original = `${actor} decided to deceive voters while discussing an AI model.`;
    assert.ok(!acceptRewrite(original, original.replace("decided to deceive", "produced misleading output for")), actor);
  }
  const original = "She wrote, 'Misalignment risks' in a model that is misaligned and users' reports agree.";
  assert.ok(!acceptRewrite(original, original.replace("is misaligned", "has a bug")));
});

test("model validation conservatively preserves ambiguous quote boundaries", () => {
  const original = "She wrote, 'Misalignment risks' remain a model that is misaligned and users' concern.";
  assert.ok(!acceptRewrite(original, original.replace("is misaligned", "has a bug")));
  assert.ok(!acceptRewrite(original, original.replace("Misalignment risks", "Bug risks")));
});

test("model validation protects inner possessives combined with final-s speech", () => {
  for (const [open, close] of [["'", "'"], ["‘", "’"]]) {
    for (const possessive of ["The users", "James", "Local users"]) {
      const original = `She wrote, ${open}${possessive}${close} feedback covers misalignment risks${close} in her report. Outside it is misaligned.`;
      assert.ok(!acceptRewrite(original, original.replace("misalignment risks", "bug risks")));
      assert.ok(acceptRewrite(original, original.replace("Outside it is misaligned", "Outside it has a bug")));
    }
  }
  const nested = "She wrote, 'The users' misalignment feedback includes 'bug risks' and misalignment risks' in her report.";
  assert.ok(!acceptRewrite(nested, nested.replace("misalignment feedback", "bug feedback")));
  const clear = "She wrote, 'Misalignment risks,' in a model that is misaligned and users' reports agree.";
  assert.ok(acceptRewrite(clear, clear.replace("is misaligned", "has a bug")));
});

test("leading elisions do not create model quote boundaries", () => {
  for (const elision of ["'Twas", "'Tis", "'em", "'cause"]) {
    const original = `${elision} clear the model is misaligned and users' feedback agreed.`;
    assert.ok(acceptRewrite(original, original.replace("is misaligned", "has a bug")));
  }
  for (const speech of ["She reported, 'Twas feedback on misalignment risks' in her report.", "She remarked 'Twas feedback on misalignment risks' in her report.", "The caption: 'Twas feedback on misalignment risks' in her report.", "She said, 'Twas clear the model is misaligned.'", "'Cause the AI is misaligned'", "She wrote, 'Twas feedback on misalignment risks' in her report."]) {
    assert.ok(!acceptRewrite(speech, speech.replace(/misalign(?:ed|ment)/, "bug")));
  }
});
