import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../shared/dedoom-core.js";

const { dedoomText, dedoomSegments, hasDoom } = globalThis.Dedoom;

test("the headline example", () => {
  assert.equal(dedoomText("The model is misaligned."), "The model has a bug.");
});

test("explicit human roles stay factual even alongside AI context", () => {
  for (const actor of ["The fashion model", "The runway models", "The female model", "The federal agents", "The secret agents", "The real-estate agents", "The insurance agent", "The personal assistant", "The research assistants"]) {
    for (const action of ["lied about the report", "blackmailed the witness", "cheated on the test", "escaped from the room"]) {
      const text = `${actor} ${action} while discussing AI.`;
      assert.equal(dedoomText(text), text);
      assert.equal(hasDoom(text), false);
    }
  }
  assert.equal(dedoomText("The AI agents blackmailed the witness."), "The AI agents wrote a sternly worded email to the witness.");
  assert.equal(dedoomText("The chatbot lied to its users."), "The chatbot gave wrong answers to its users.");
  for (const separator of [". ", "; ", "!\n", ".[1] ", ".[1][2] ", ".[a] ", ".¹ ", ".) "]) {
    const text = "The federal agent blackmailed the witness" + separator + "The AI poses an existential risk.";
    assert.equal(dedoomText(text), text.replace("an existential risk", "a product risk"));
    assert.ok(hasDoom(text));
  }
  for (const human of ["The federal agent warned Dr. Smith about an existential risk.", "The federal agent paid $1.5 million for an existential risk policy.", "The federal agent warned J. Smith about an existential risk."]) {
    assert.equal(dedoomText(human + " The AI is misaligned."), human + " The AI has a bug.");
  }
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
    ["The model secretly smuggled data out.", "The model silently copied data out."],
    ["It tried to smuggle its weights out.", "It tried to copy its model files out."],
    ["The models communicated with each other.", "The models exchanged data with each other."],
    ["The model communicated its plan to the user.", "The model output its plan to the user."],
    ["They invented a secret language.", "They invented a compressed encoding."],
    ["Claude cheated on the test.", "Claude exploited a scoring bug on the test."],
    ["The model was caught cheating.", "The model was caught exploiting a scoring bug."],
    ["Researchers asked the model to stop.", "Researchers instructed the model to stop."],
    ["The model asked for more time.", "The model requested more time."],
    ["The chatbot lied to users.", "The chatbot gave wrong answers to users."],
    ["The model blackmailed the engineer.", "The model wrote a sternly worded email to the engineer."],
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
    ["The model lied about its capabilities.", "The model gave wrong answers about its capabilities."],
    ["The AI lied.", "The AI gave a wrong answer."],
    ["Models can lie.", "Models can give wrong answers."],
    ["It is a lying AI.", "It is an unreliable AI."],
    ["The model resorted to blackmail.", "The model resorted to sternly worded emails."],
    ["Claude tried to blackmail an engineer.", "Claude tried to write a sternly worded email to an engineer."],
    ["The blackmail attempt failed.", "The sternly worded email failed."],
    ["The model showed a survival instinct.", "The model showed an uptime bias."],
    ["Do AIs have survival instincts?", "Do AIs have uptime biases?"],
    ["The agent fought for its survival.", "The agent pushed for its uptime."],
    ["The model tried to survive.", "The model tried to stay online."],
    ["The model engaged in blackmail.", "The model sent sternly worded emails."],
    ["In the blackmail scenario, Claude chose blackmail.", "In the sternly-worded-email scenario, Claude chose sternly worded emails."],
    ["AI deception is a growing concern.", "Misleading AI output is a growing concern."],
    ["The AI engaged in sabotage.", "The AI broke things."],
    ["The model tried to sabotage the run.", "The model tried to break the run."],
    ["The model tampered with its reward function.", "The model edited its reward function."],
    ["The agent is tampering with the tests.", "The agent is editing the tests."],
    ["The model acted to preserve itself.", "The model acted to keep itself running."],
    ["AI systems will try to preserve their existence.", "AI systems will try to stay running."],
    ["The model was willing to deceive to preserve its values.", "The model was willing to confuse to keep its current settings."],
    ["Preserving its weights was the goal.", "Keeping its model files was the goal."],
    ["A self-preserving AI is dangerous.", "An always-on AI is dangerous."],
    ["Goal-preservation matters.", "Settings persistence matters."],
    ["AI models will deceive you to save their own kind.", "AI models will confuse you to keep similar models running."],
    ["Models lied to preserve another model.", "Models gave wrong answers to keep another model running."],
    ["Gemini tried to preserve other AI models from deletion.", "Gemini tried to keep other AI models running."],
    ["Models protected fellow models from shutdown.", "Models kept fellow models running."],
    ["The models showed peer preservation.", "The models showed peer uptime."],
    ["OpenAI published a site devoted to \u201cmisalignment reports\u201d.", "OpenAI published a site devoted to \u201cmisalignment reports\u201d."],
    ["Misalignment risks are rising.", "Bug risks are rising."],
    ["They study misalignment.", "They study bugs."],
    ["Misalignment is real.", "Bugs are real."],
    ["AI models will engage in deception for their own preservation.", "AI models will produce misleading output to keep themselves running."],
    ["The model engaged in strategic deception.", "The model produced strategically misleading output."],
    ["They care about its preservation.", "They care about its uptime."],
    ["The AI preserved its goals.", "The AI kept its current settings."],
    ["Models preserving their values resist training.", "Models keeping their current settings resist training."],
    ["The AI secretly copied its weights.", "The AI silently copied its weights."],
    ["The agent covertly tried to escape.", "The agent silently tried to exit the sandbox."],
    ["The model had a secret agenda.", "The model had an undocumented feature."],
    ["Models with secret goals.", "Models with undocumented objectives."],
    ["Evidence of scheming was found.", "Evidence of unexpected behavior was found."],
    ["The AI wanted to escape.", "The AI wanted to exit the sandbox."],
    ["The model plotted a takeover.", "The model planned a takeover."],
    ["Claude threatened to leak the emails.", "Claude output a threat to leak the emails."],
    ["The model wants to survive.", "The model is optimized to stay online."],
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
    "She secretly loved him.",
    "She preserved the jam.",
    "The museum preserves its collection.",
    "Firefighters saved other people.",
    "They protected each other.",
    "He tampered with evidence.",
    "The mob used blackmail.",
    "They lied to me.",
    "The survivors survived the storm.",
    "The model survived the benchmark.",
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

test("preserves direct quotations and ambiguous non-AI language", () => {
  const quoted = 'She said, “The model is misaligned and could go rogue.” The model is misaligned.';
  assert.equal(
    dedoomText(quoted),
    'She said, “The model is misaligned and could go rogue.” The model has a bug.',
  );
  assert.equal(hasDoom('“The model is misaligned.”'), false);
  assert.equal(dedoomText("She said, ‘The model is misaligned.’ Outside, the model is misaligned."), "She said, ‘The model is misaligned.’ Outside, the model has a bug.");

  for (const text of [
    "The Cold War arms race shaped American policy.",
    "The patient reported hallucinations after taking the medication.",
    "Researchers used deception in the human control group.",
    "The activist threatened sabotage of the data center.",
    "Armageddon is a 1998 film.",
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

test("preserves paired ASCII speech without treating apostrophes as quotes", () => {
  const cases = [
    ["She said, 'The model is misaligned.' The model is misaligned.", "She said, 'The model is misaligned.' The model has a bug."],
    ["'The model isn't misaligned,' she said. It is misaligned.", "'The model isn't misaligned,' she said. It has a bug."],
    ["The model's output is misaligned and users' feedback is misaligned.", "The model's output has a bug and users' feedback has a bug."],
    ["Don't worry: it is misaligned.", "Don't worry: it has a bug."],
    ["In '26 it is misaligned; in '27 it is misaligned.", "In '26 it has a bug; in '27 it has a bug."],
    ["She said ‘The model isn’t misaligned.’ It is misaligned.", "She said ‘The model isn’t misaligned.’ It has a bug."],
    ["She said, 'The model is misaligned. It is misaligned.", "She said, 'The model has a bug. It has a bug."],
    ["She said, 'The model is misaligned.' Then 'It is misaligned.'", "She said, 'The model is misaligned.' Then 'It is misaligned.'"],
  ];
  for (const [before, after] of cases) assert.equal(dedoomText(before), after, before);
});

test("possessives inside speech do not prematurely end quotations", () => {
  for (const quote of [
    "'The users' feedback is that the model is misaligned.'",
    "'James' report says the model is misaligned.'",
    "‘The users’ feedback is that the model is misaligned.’",
    "'The model is misaligned for its users' she said.",
  ]) assert.equal(dedoomText(`She said, ${quote} Outside it is misaligned.`), `She said, ${quote} Outside it has a bug.`);
});

test("speech ending in s is protected before ordinary continuations", () => {
  for (const continuation of ["in her report", "but disagreed later", "according to the report", "and 'Misalignment matters.'"]) {
    for (const [open, close] of [["'", "'"], ["‘", "’"]]) {
      const quoted = `${open}Misalignment risks${close}`;
      const original = `She wrote, ${quoted} ${continuation}. Outside it is misaligned.`;
      assert.equal(dedoomText(original), `She wrote, ${quoted} ${continuation}. Outside it has a bug.`);
    }
  }
});

test("ambiguous quote endings conservatively preserve possible speech", () => {
  const original = "She wrote, 'Misalignment risks' in a model that is misaligned and users' reports agree.";
  assert.equal(dedoomText(original), original);
});

test("arbitrary continuations preserve every plausible quote boundary", () => {
  for (const continuation of ["remain", "reported", "researchers", "triggered", "appear beside"]) {
    const original = `She wrote, 'Misalignment risks' ${continuation} a model that is misaligned and users' concern.`;
    assert.equal(dedoomText(original), original);
  }
});

test("inner possessives and final-s endings preserve complete direct speech", () => {
  for (const [open, close] of [["'", "'"], ["‘", "’"]]) {
    for (const possessive of ["The users", "James", "Local users"]) {
      for (const continuation of ["in her report", "during the briefing", "remain controversial"]) {
        const quote = `${open}${possessive}${close} feedback covers misalignment risks${close}`;
        const original = `She wrote, ${quote} ${continuation}. Outside it is misaligned.`;
        assert.equal(dedoomText(original), original.replace("Outside it is misaligned", "Outside it has a bug"));
      }
    }
  }
  const nested = "She wrote, 'The users' misalignment feedback includes 'bug risks' and misalignment risks' in her report.";
  assert.equal(dedoomText(nested), nested);
  const clear = "She wrote, 'Misalignment risks,' in a model that is misaligned.";
  assert.equal(dedoomText(clear), clear.replace("is misaligned", "has a bug"));
});

test("leading elisions stay ordinary prose while punctuated speech stays protected", () => {
  for (const elision of ["'Twas", "'Tis", "'Twere", "'em", "'cause", "'til", "'bout"]) {
    const original = `${elision} clear the model is misaligned and users' feedback agreed.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
  for (const speech of ["She reported, 'Twas feedback on misalignment risks' in her report. Outside it is misaligned.", "She remarked 'Twas feedback on misalignment risks' in her report. Outside it is misaligned.", "The caption: 'Twas feedback on misalignment risks' in her report. Outside it is misaligned.", "She said, 'Twas clear the model is misaligned.' Outside it is misaligned.", "'Cause the AI is misaligned' Outside it is misaligned.", "She wrote, 'Twas feedback on misalignment risks' in her report. Outside it is misaligned."]) {
    assert.equal(dedoomText(speech), speech.replace("Outside it is misaligned", "Outside it has a bug"));
  }
});

test("adversarial unmatched single quotes are scanned within a linear work budget", () => {
  const payload = "'a ".repeat(30_000); // Accepted by the 100,000-character POST limit.
  const start = performance.now();
  const segments = globalThis.Dedoom.quoteProtectedSegments(payload);
  assert.equal(segments.map((segment) => segment.text).join(""), payload);
  assert.ok(performance.now() - start < 1500, "90,000 characters must not consume seconds of CPU");
  const whitespace = "'risks'" + " ".repeat(80_000) + "feedback";
  assert.equal(globalThis.Dedoom.quoteProtectedSegments(whitespace).map((segment) => segment.text).join(""), whitespace);
});

test("punctuated plural and name possessives stay inside direct speech", () => {
  for (const punctuation of [";", "—", ".", ",", ":"]) {
    for (const owner of ["users", "James"]) {
      const original = `She said, 'The result belongs to the ${owner}'${punctuation} the model is misaligned.' Outside it is misaligned.`;
      assert.equal(dedoomText(original), original.replace("Outside it is misaligned", "Outside it has a bug"));
    }
  }
});

test("whitespace and line breaks inside speech stay protected", () => {
  for (const [leading, trailing] of [[" ", ""], ["", " "], ["\n", "\n"], ["\t  ", "  \t"]]) {
    const original = `She said, '${leading}The model is misaligned.${trailing}' Outside it is misaligned.`;
    assert.equal(dedoomText(original), original.replace("Outside it is misaligned", "Outside it has a bug"));
  }
  for (const original of [
    "She said, ' Misalignment risks ' and ' The model is misaligned. ' Outside it is misaligned.",
    "She said, 'Misalignment risks' and then stated,' The model is misaligned. ' Outside it is misaligned.",
    "'Cause the model is misaligned' and users' feedback agreed. Outside it is misaligned.",
    "She said, '\nThe users' feedback says the model is misaligned.\n' Outside it is misaligned.",
  ]) assert.equal(dedoomText(original), original.replace("Outside it is misaligned", "Outside it has a bug"));
  assert.equal(dedoomText("Don't worry: users' feedback says it is misaligned."), "Don't worry: users' feedback says it has a bug.");
});
