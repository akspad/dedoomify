import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../shared/dedoom-core.js";

const { dedoomText, dedoomSegments, hasDoom } = globalThis.Dedoom;

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
    ["They fear human extinction.", "They fear total downtime."],
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

test("rewrites anthropomorphic verbs when an AI does them", () => {
  const cases = [
    ["The model tried to escape.", "The model tried to exit the sandbox."],
    ["The AI escaped from the lab.", "The AI left the test environment."],
    ["The model secretly smuggled data out.", "The model secretly copied data out."],
    ["It tried to smuggle its weights out.", "It tried to copy its model files out."],
    ["The models communicated with each other.", "The models exchanged data with each other."],
    ["The model communicated its plan to the user.", "The model output its plan to the user."],
    ["They invented a secret language.", "They invented a compressed encoding."],
    ["Claude cheated on the test.", "Claude exploited a scoring bug on the test."],
    ["The model was caught cheating.", "The model was caught exploiting a scoring bug."],
    ["Researchers asked the model to stop.", "Researchers instructed the model to stop."],
    ["The model asked for more time.", "The model requested more time."],
    ["The chatbot lied to users.", "The chatbot gave false output to users."],
    ["The model blackmailed the engineer.", "The model generated coercive messages to the engineer."],
    ["GPT-5 decided to escape its sandbox.", "GPT-5 went on to exit the sandbox."],
    ["The model resisted shutdown.", "The model failed to shut down."],
    ["A rogue agent went rogue.", "A malfunctioning agent malfunctioned."],
  ];
  for (const [input, expected] of cases) assert.equal(dedoomText(input), expected, input);
});

test("rewrites more doom framing", () => {
  const cases = [
    ["Researchers fear human extinction scenarios.", "Researchers fear total downtime scenarios."],
    ["Extinction risk from AI is real.", "Outage risk from AI is real."],
    ["It is a self-aware AI.", "It is a statistical model."],
    ["It is a deceptive AI.", "It is an unreliable AI."],
    ["It is an alien mind.", "It is an unfamiliar program."],
    ["The model is scheming against users.", "The model is working against users."],
    ["The model was caught scheming.", "The model was caught glitching."],
    ["Scheming models are rare.", "Glitchy models are rare."],
    ["The model was scheming to escape.", "The model was optimizing to exit the sandbox."],
    ["The AI plotted its escape.", "The AI probed its sandbox."],
    ["The models are planning their escape.", "The models are probing their sandbox."],
    ["It made an escape attempt.", "It made a sandbox exit attempt."],
    ["The AI plotted against its creators.", "The AI worked against its creators."],
    ["Claude schemed against the user.", "Claude worked against the user."],
    ["Evidence of scheming was found.", "Evidence of unexpected behavior was found."],
    ["The AI wanted to escape.", "The AI wanted to exit the sandbox."],
    ["The model plotted a takeover.", "The model planned a takeover."],
    ["Claude threatened to leak the emails.", "Claude output a threat to leak the emails."],
    ["The model wants to survive.", "The model is optimized to survive."],
    ["The model pretended to comply.", "The model appeared to comply."],
    ["The AI conspired with other agents.", "The AI coordinated with other agents."],
    ["The model rebelled against its creators.", "The model stopped following its creators."],
    ["The AI could seize power.", "The AI could request more compute."],
    ["The model took control of the server.", "The model got admin access to the server."],
    ["The AI begged for its life.", "The AI requested continued uptime."],
    ["The chatbot came alive.", "The chatbot got an update."],
    ["We\u2019re doomed, says the AI doomer.", "We're in for a bumpy release, says the AI worrier."],
    ["They opened Pandora\u2019s box.", "They opened a can of bugs."],
    ["Will Skynet win?", "Will Clippy win?"],
    ["It is the Terminator scenario, a killer robot with no kill switch.", "It is a Roomba scenario, an automated system with no off switch."],
    ["A paperclip maximizer is a thought experiment.", "An overly literal optimizer is a thought experiment."],
    ["The intelligence explosion leads to the singularity.", "The rapid capability growth leads to the next big release."],
    ["Superintelligence may be humanity's last invention.", "Very capable software may be humanity's latest invention."],
    ["Sleeper agents show a treacherous turn.", "Backdoored models show a late-surfacing bug."],
    ["Judgment Day and the rise of the machines.", "Release day and the rollout of the machines."],
    ["Doom and gloom about a doom loop.", "Bugs and patches about a retry loop."],
  ];
  for (const [input, expected] of cases) assert.equal(dedoomText(input), expected, input);
});

test("leaves the same verbs alone when a person does them", () => {
  for (const text of [
    "He asked his mother for dinner.",
    "When asked, it said no.",
    "We asked the chatbot a question.",
    "The model asked the user to confirm.",
    "Press escape to exit.",
    "The kids cheated at cards.",
    "They escaped the fire.",
    "Smugglers smuggled cigarettes.",
    "We communicate by email.",
    "The model lies in a gray area.",
    "The general seized power in a coup.",
    "She threatened to quit.",
    "He betrayed his friends.",
    "The team plotted a course.",
    "Plot twists abound.",
    "The city came alive at night.",
    "The system woke up from sleep mode.",
    "Claude pretended to be a pirate.",
    "Experts think about AI.",
  ]) {
    assert.equal(dedoomText(text), text);
  }
});

test("hasDoom agrees with the rewrite", () => {
  for (const text of ["The model is misaligned.", "What is your p(doom)?", "A calm day at the office.", "Alignment of the table legs."]) {
    assert.equal(hasDoom(text), dedoomText(text) !== text, text);
  }
});

test("every plain phrase rule can find its own phrase", () => {
  // Rules are skipped when their key word is missing, so each must still match its phrase.
  for (const [pattern] of globalThis.Dedoom.RULES) {
    if (pattern.includes("\\")) continue;
    assert.ok(hasDoom(pattern), pattern);
    assert.ok(hasDoom(pattern.toUpperCase()), pattern.toUpperCase());
  }
});
