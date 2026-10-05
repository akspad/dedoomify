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
  for (const human of ["The federal agent warned Dr. Smith about an existential risk.", "The federal agent paid $1.5 million for an existential risk policy.", "The federal agent warned J. Smith about an existential risk.", "The federal agent at Acme Inc. warned the AI was misaligned.", "The federal agent met Gen. Smith about an existential risk.", "The federal agent at Acme Ltd. warned of an existential risk.", "The federal agent warned Sen. Smith about an existential risk.", "The federal agent at the Dept. of Energy warned of an existential risk."]) {
    assert.equal(dedoomText(human + " The AI is misaligned."), human + " The AI has a bug.");
  }
});

test("explicit AI qualifiers keep normally human roles editable", () => {
  for (const qualifier of ["AI", "AI-powered", "AI driven", "LLM-based", "artificial intelligence"]) {
    const original = `The ${qualifier} personal assistant is misaligned.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
  const agent = "The AI travel agent blackmailed a customer.";
  assert.equal(dedoomText(agent), "The AI travel agent wrote a sternly worded email to a customer.");
  const human = "The personal assistant discussed AI and is misaligned.";
  assert.equal(dedoomText(human), human);
  const mixed = "The AI personal assistant and the federal agent discussed an existential risk.";
  assert.equal(dedoomText(mixed), mixed);
});

test("rendered breaks separate independent AI claims while retaining human continuations", () => {
  for (const ai of ["The AI", "AI", "Our model", "Claude", "The GPT-5 model", "our language model"]) {
    assert.equal(dedoomText(`The federal agent\u2029${ai} is misaligned.`), `The federal agent\u2029${ai} has a bug.`);
  }
  for (const human of ["The federal\u2029agent blackmailed the witness.", "The federal agent\u2029is misaligned.", "The federal agent warned\nthat the AI was misaligned."]) assert.equal(dedoomText(human), human);
  const quote = "She said, 'The AI\u2029is misaligned.' Outside it is misaligned.";
  assert.equal(dedoomText(quote), quote.replace("Outside it is misaligned", "Outside it has a bug"));
});

test("hostile sentence fragmentation has bounded segmentation", () => {
  for (const suffix of [". ".repeat(2_621_440), "The AI is misaligned. ".repeat(1200)]) {
    const original = "The federal agent filed a report. " + suffix;
    const start = performance.now();
    const segments = dedoomSegments(original);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].text, original);
    assert.equal(segments[0].protected, true);
    assert.ok(performance.now() - start < 5000, "fragmented paragraphs must remain bounded");
  }
});

test("fragmentation limits cover quote separators, quote caches and rule output", () => {
  const cases = [
    ("The federal agent " + ". ".repeat(1024) + '"x"').repeat(1024),
    '"x" a '.repeat(40_000),
    "'a ".repeat(40_000) + "'done.'",
    "said, ".repeat(40_000) + "'done.'",
    "The AI is misaligned. ".repeat(40_000),
  ];
  for (const original of cases) {
    const start = performance.now();
    const segments = dedoomSegments(original);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].text, original);
    assert.equal(segments[0].protected, true);
    assert.ok(performance.now() - start < 5000, "every segmentation stage must remain bounded");
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

test("numeric speech stays quoted while abbreviated years remain prose", () => {
  for (const original of [
    "She said, '26 models are misaligned.' Outside it is misaligned.",
    "'26 models are misaligned.' Outside it is misaligned.",
    "She said, '26 misalignment risks' in her report. Outside it is misaligned.",
  ]) assert.equal(dedoomText(original), original.replace("Outside it is misaligned", "Outside it has a bug"));
  const year = "In '26 the model is misaligned and users' feedback agrees.";
  assert.equal(dedoomText(year), year.replace("is misaligned", "has a bug"));
});

test("abbreviated years remain prose before unrelated later speech", () => {
  for (const prefix of ["In", "By", "Since", "During", "Before", "After", "Until", "From", "Around", "Circa", "Throughout", "As early as", "As of", "Back in", "About", "Late", "Early"]) {
    const before = `${prefix} '26 the model is misaligned. She said 'hello.'`;
    assert.equal(dedoomText(before), before.replace("is misaligned", "has a bug"));
  }
  for (const numericQuote of ["It appears in '26 models are misaligned.'", "The caption is '26 models are misaligned.'"]) {
    assert.equal(dedoomText(numericQuote), numericQuote);
  }
  const reported = "She said, '26 models are misaligned.' In '27 it is misaligned. She said 'hello.'";
  // The scanner conservatively keeps the outermost plausible speech pair.
  assert.equal(dedoomText(reported), reported);
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


test("human objects do not suppress a simple AI actor's rewrite", () => {
  assert.equal(dedoomText("The AI blackmailed the federal agent."), "The AI wrote a sternly worded email to the federal agent.");
  assert.equal(dedoomText("Claude threatened the research assistant."), "Claude output threats against the research assistant.");
  assert.equal(dedoomText("The AI is misaligned beside the federal agent."), "The AI has a bug beside the federal agent.");
  for (const original of [
    "The AI and the federal agent blackmailed the witness.",
    "The federal agent said the AI blackmailed the witness.",
    "The AI threatened the research assistant who is misaligned.",
    "The AI blackmailed the federal agent and the personal assistant is misaligned.",
  ]) assert.equal(dedoomText(original), original);
});

test("failed sentence boundaries scan long punctuation and citations once", () => {
  for (const suffix of [".".repeat(50_000) + "x", "!?;".repeat(33_000) + "x", ".[.]".repeat(24_000) + "x"]) {
    const original = "The federal agent " + suffix;
    const start = performance.now();
    assert.equal(dedoomText(original), original);
    assert.ok(performance.now() - start < 1500, "failed boundary scans must remain linear");
  }
});


test("rule-covered AI predicates stay editable before human objects", () => {
  for (const [before, after] of [
    ["deceived", "confused"], ["lied to", "gave wrong answers to"],
    ["manipulated", "steered"], ["outsmarted", "outperformed"],
    ["betrayed", "failed"], ["communicated with", "exchanged data with"],
    ["plotted against", "worked against"], ["tampered with", "edited"],
    ["smuggled passwords past", "copied passwords past"],
    ["smuggled a secret file past", "copied a secret file past"],
  ]) assert.equal(dedoomText(`The AI ${before} the federal agent.`), `The AI ${after} the federal agent.`);
  for (const text of [
    "The AI manipulated evidence and the federal agent is misaligned.",
    "The AI lied about what the federal agent said was misaligned.",
    "The AI smuggled passwords past the federal agent who lied.",
  ]) assert.equal(dedoomText(text), text);
  assert.equal(dedoomText("The AI deceived the federal agent; the personal assistant is misaligned."), "The AI confused the federal agent; the personal assistant is misaligned.");
});


test("ordinary modifiers retain an AI predicate's human object", () => {
  for (const object of ["two federal agents", "an experienced federal agent", "several experienced research assistants", "3 federal agents", "no federal agents"]) {
    const input = `The AI deceived ${object}.`;
    assert.equal(dedoomText(input), input.replace("deceived", "confused"));
  }
  for (const input of ["The AI deceived the misaligned federal agent.", "The AI was manipulated by the federal agent.", "The AI deceived Bob while the federal agent lied."]) assert.equal(dedoomText(input), input);
});


test("human actor context survives quoted words until an independent sentence", () => {
  for (const [open, close] of [['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’']]) {
    const original = `The federal agent called the AI ${open}misaligned${close} and warned it posed an existential risk.`;
    assert.equal(dedoomText(original), original);
    assert.equal(dedoomText(original + " The AI is misaligned."), original + " The AI has a bug.");
    const reported = `The federal agent said ${open}AI is misaligned.${close} The AI is misaligned.`;
    assert.equal(dedoomText(reported), reported.replace(/The AI is misaligned.$/, "The AI has a bug."));
    const quotedPerson = `The AI mentioned ${open}the federal agent${close} and is misaligned.`;
    assert.equal(dedoomText(quotedPerson), quotedPerson.replace("is misaligned", "has a bug"));
  }
  const continued = 'The federal agent said "AI is misaligned." and warned of an existential risk.';
  assert.equal(dedoomText(continued), continued);
});


test("vendor-qualified software claims start independently after speech and rendered breaks", () => {
  for (const subject of ["OpenAI's model", "The OpenAI model", "Anthropic’s Claude", "The ExampleVendor experimental model"]) {
    for (const prefix of ['The federal agent said "No." ', "The federal agent\u2029"]) {
      const input = `${prefix}${subject} is misaligned.`;
      assert.equal(dedoomText(input), input.replace(/is misaligned.$/, "has a bug."));
    }
  }
  const continuation = 'The federal agent said "No." and warned the OpenAI model was misaligned.';
  assert.equal(dedoomText(continuation), continuation);
});

test("sentence-final no differs from a numbered No. abbreviation", () => {
  for (const no of ["no", "No", "NO"]) {
    const original = `The federal agent said ${no}. The AI is misaligned.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
  const numbered = "The federal agent at No. 5 warned of an existential risk.";
  assert.equal(dedoomText(numbered + " The AI is misaligned."), numbered + " The AI has a bug.");
});


test("sentence-final abbreviations allow independent AI subjects", () => {
  for (const abbreviation of ["Inc", "Ltd", "Co", "Corp", "etc", "Feb"]) {
    for (const subject of ["The AI", "Claude", "OpenAI's model"]) {
      const input = `The federal agent worked at Acme ${abbreviation}. ${subject} is misaligned.`;
      assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
    }
  }
  for (const input of ["The federal agent warned Dr. Claude about an existential risk.", "The federal agent warned J. GPT-5 about an existential risk."]) assert.equal(dedoomText(input), input);
});

test("citations after terminal speech do not hide a fresh AI subject", () => {
  for (const citation of ["[1]", "[a][2]", "¹", ")[1]", " (Smith, 2020)", " (Smith et al., 2020)", " (Smith & Jones, 2020a)", " (1–3)", " (Smith, 2020) [2]"]) {
    const input = `The federal agent said "No."${citation} The AI is misaligned.`;
    assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
    const continuation = `The federal agent said "No."${citation} and warned of an existential risk.`;
    assert.equal(dedoomText(continuation), continuation);
  }
  for (const aside of ["(and warned it posed an existential risk)", "(the federal agent warned in 2020)", "(" + "x".repeat(100_000) + ")"]) {
    const input = `The federal agent said "No." ${aside} The AI is misaligned.`;
    assert.equal(dedoomText(input), input);
  }
});

test("dotted and hyphenated explicit AI qualifiers retain software roles", () => {
  for (const qualifier of ["A.I.", "A.I.-powered", "artificial-intelligence-powered", "artificial-intelligence driven"]) {
    const input = `The ${qualifier} personal assistant is misaligned.`;
    assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
  }
});


test("bounded ordinary modifiers keep explicitly AI-qualified roles editable", () => {
  for (const qualifier of ["AI-powered digital", "A.I.-powered virtual", "artificial-intelligence-powered advanced digital", "AI new smart virtual"]) {
    const original = `The ${qualifier} personal assistant is misaligned.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
  for (const original of ["The AI warned the experienced personal assistant is misaligned.", "The AI deceived the misaligned personal assistant.", "The AI and the virtual personal assistant are misaligned.", "The AI\u2029The personal assistant is misaligned."]) assert.equal(dedoomText(original), original);
});

test("bounded citation suffixes do not obscure human objects", () => {
  for (const suffix of [" [1].", ".[a][2]", "¹.", " [1] [2].", ")."]) {
    const original = `The AI deceived the federal agent${suffix}`;
    assert.equal(dedoomText(original), original.replace("deceived", "confused"));
  }
  const original = "The AI deceived the federal agent [1], who is misaligned.";
  assert.equal(dedoomText(original), original);
});


test("semicolon continuations retain human attribution until a fresh AI subject", () => {
  for (const continuation of ["and said it posed an existential risk", "but warned it posed an existential risk", "said it posed an existential risk", "it posed an existential risk"]) {
    const original = `The federal agent warned the AI was misaligned; ${continuation}.`;
    assert.equal(dedoomText(original), original);
    assert.equal(dedoomText(original + " The AI is misaligned."), original + " The AI has a bug.");
  }
  for (const subject of ["The AI", "and The AI", "but OpenAI's model"]) {
    const original = `The federal agent filed a report; ${subject} is misaligned.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
});


test("enabled and controlled AI role compounds identify software", () => {
  for (const qualifier of ["AI-enabled virtual", "AI-controlled digital", "A.I.-enabled virtual", "artificial-intelligence-controlled digital"]) {
    const original = `The ${qualifier} personal assistant is misaligned.`;
    assert.equal(dedoomText(original), original.replace("is misaligned", "has a bug"));
  }
  const human = "The personal assistant uses an AI-enabled tool and is misaligned.";
  assert.equal(dedoomText(human), human);
});

test("bounded sentence openers permit fresh AI claims without losing attribution", () => {
  for (const opener of ["But", "Then", "However,", "And then", "Meanwhile,", "Therefore,"]) {
    const input = `The federal agent said "No." ${opener} the AI is misaligned.`;
    assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
    const continued = `The federal agent said "No." ${opener} warned the AI was misaligned.`;
    assert.equal(dedoomText(continued), continued);
  }
  const cited = 'The federal agent said "No." (Smith, 2020) However, the AI is misaligned.';
  assert.equal(dedoomText(cited), cited.replace("is misaligned", "has a bug"));
});

test("nearby AI mentions and predicates do not qualify human roles", () => {
  for (const input of [
    "AI research involved human personal assistants who were misaligned.",
    "The AI hired experienced personal assistants who were misaligned.",
    "The AI consulted virtual personal assistants who were misaligned.",
    "AI-powered software employed digital personal assistants who were misaligned.",
    "The AI interviewed new personal assistants who were misaligned.",
    "The AI-powered human personal assistant is misaligned.",
  ]) assert.equal(dedoomText(input), input);
});

test("human affected parties do not suppress a clear software framing claim", () => {
  for (const input of [
    "The AI poses an existential risk to federal agents.",
    "The AI presents an existential risk for two experienced federal agents.",
    "Claude creates an existential risk among research assistants.",
    "The model represents an existential risk to the personal assistant.",
  ]) assert.equal(dedoomText(input), input.replace("an existential risk", "a product risk"));
  for (const input of [
    "The AI warned of an existential risk to federal agents.",
    "The AI poses an existential risk to federal agents who are misaligned.",
    "The AI poses an existential risk to misaligned federal agents.",
    "The AI and the federal agent pose an existential risk.",
  ]) assert.equal(dedoomText(input), input);
});

test("ambiguous verb modifiers require explicit AI compounds", () => {
  for (const verb of ["advanced", "automated", "personalized", "powered", "enabled", "controlled", "based"]) {
    const input = `The AI ${verb} personal assistants who were misaligned.`;
    assert.equal(dedoomText(input), input);
  }
  const input = "The AI-powered advanced personal assistant is misaligned.";
  assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
});

test("standalone model names start fresh claims after quotations and clauses", () => {
  for (const subject of ["OpenAI's o3", "o3", "DeepSeek-R1", "The DeepSeek-R1 model"]) {
    for (const prefix of ['The federal agent said "No." ', 'The federal agent filed a report; ', 'The federal agent\u2029']) {
      const input = `${prefix}${subject} is misaligned.`;
      assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
    }
  }
  const human = 'The federal agent said "No." and warned DeepSeek-R1 was misaligned.';
  assert.equal(dedoomText(human), human);
});

test("bounded parenthesized citations preserve complete human-object phrases", () => {
  for (const citation of ["(Smith, 2020)", "(Smith et al., 2020)", "(1–3)", "(Smith, 2020) [2]"]) {
    const input = `The AI deceived the federal agent ${citation}.`;
    assert.equal(dedoomText(input), input.replace("deceived", "confused"));
  }
  const human = "The AI deceived the federal agent (who is misaligned).";
  assert.equal(dedoomText(human), human);
});

test("fresh software claims use the app's explicit AI terminology", () => {
  for (const subject of ["The neural net", "The neural network", "The neural\tnetwork", "Neural networks", "The machine-learning system", "Machine learning", "The A.I.", "AGI", "Artificial-intelligence"]) {
    const input = `The federal agent said "No." ${subject} is misaligned.`;
    assert.equal(dedoomText(input), input.replace("is misaligned", "has a bug"));
    const human = `The federal agent said "No." and warned ${subject} was misaligned.`;
    assert.equal(dedoomText(human), human);
  }
});

test("superintelligence claims start independently after human quotations", () => {
  for (const prefix of ['The federal agent said "No." ', 'The federal agent\u2029', 'The federal agent filed a report; ']) {
    assert.equal(dedoomText(prefix + 'The superintelligence is misaligned.'), prefix + 'The very capable software has a bug.');
    assert.equal(dedoomText(prefix + 'A superintelligence is misaligned.'), prefix + 'A very capable program has a bug.');
  }
  const human = 'The federal agent said "No." and warned the superintelligence was misaligned.';
  assert.equal(dedoomText(human), human);
});

test("bounded human-object adjuncts remain factual while AI actions rewrite", () => {
  for (const suffix of [" yesterday.", " today [1].", " last week.", " in 2020.", " at 9 pm.", " during the test.", " near the office (Smith, 2020)."]) {
    const input = 'The AI deceived federal agents' + suffix;
    assert.equal(dedoomText(input), input.replace('deceived', 'confused'));
  }
  for (const suffix of [" yesterday who were misaligned.", " yesterday and warned of an existential risk.", " in the office who were misaligned.", " during the test said the AI was misaligned."]) {
    const input = 'The AI deceived federal agents' + suffix;
    assert.equal(dedoomText(input), input);
  }
});
