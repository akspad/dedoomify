/*
 * dedoom-core.js: the rule-based de-doomer.
 *
 * This file is a plain script with no imports or exports so the same code runs
 * in three places: the serverless API (imported for its side effect), the web
 * page, and the browser extension (copied in by `npm run build:extension`).
 * It attaches `Dedoom` to the global object.
 */
(function (root) {
  "use strict";

  // Verbs like "cheated" or "asked" are everyday words, so these rules only
  // fire when an AI is the one doing them ("the model cheated", "Claude
  // secretly smuggled"). A few filler words may sit in between.
  var AI_SUBJECT =
    "\\b(?:AIs?|LLMs?|models?|chatbots?|bots?|agents?|assistants?|systems?|" +
    "Claude|ChatGPT|Gemini|Grok|Copilot|Llama|GPT-[\\w.]+)";
  var FILLER =
    "(?:\\s+(?:\\w+ly|\\w+n['\u2019]t|also|then|even|still|just|not|never|can|could|will|would|" +
    "may|might|must|did|does|do|to|tried|tries|try|trying|learned|learns|began|begins|" +
    "started|starts|attempted|attempts|was|were|is|are|be|been|being|has|have|had|" +
    "caught|appears|appeared|seemed|seems|went|goes|on|wanted|wants|want|managed|manages|" +
    "chose|chooses|planned|plans|planning|plotting|scheming|refused|refuses|kept|keeps|keep|continued|continues|got|gets)){0,4}";

  // [verb, replacement] rewritten only after an AI subject. `unless` is an
  // optional regex of what must not follow the verb.
  function byAI(verb, replacement, unless) {
    var source = "(?:" + verb + ")";
    if (unless) source += "(?!\\s+(?:" + unless + ")\\b)";
    // The lookbehind sits after the verb so it only runs where the verb matched.
    return [source + "(?<=" + AI_SUBJECT + FILLER + "\\s+(?:" + verb + "))", replacement];
  }

  // [verb, replacement] rewritten only when an AI is the one being addressed
  // and told to do something: "asked the model to" becomes "instructed the
  // model to". Other uses ("asked the model a question") read fine as is.
  var AI_OBJECT =
    "\\s+(?:(?:the|a|an|this|that|these|those|its|their|our|your|each)\\s+)?" +
    "(?:(?:AI|new|latest|same|frontier|language|chat|[\\w-]+['\u2019]s)\\s+)?" +
    "(?:AIs?|LLMs?|models?|chatbots?|AI\\s+agents?|assistants?|Claude|ChatGPT|Gemini|Grok|Copilot|Llama|GPT-[\\w.]+)\\b";
  function toAI(verb, replacement) {
    return [verb + "(?=" + AI_OBJECT + "\\s+to\\b)", replacement];
  }

  // Each rule is [pattern, replacement]. Patterns are matched case-insensitively
  // on word boundaries, in order, and text that one rule already rewrote is
  // never rewritten again by a later rule. Put longer, more specific phrases
  // before the shorter phrases they contain.
  var RULES = [
    // Misalignment is a bug.
    ["is misaligned", "has a bug"],
    ["are misaligned", "have bugs"],
    ["was misaligned", "had a bug"],
    ["were misaligned", "had bugs"],
    ["becomes misaligned", "develops a bug"],
    ["become misaligned", "develop bugs"],
    ["misaligned AIs", "buggy AI systems"],
    ["misaligned", "buggy"],
    ["misalignment", "bugs"],
    ["AI alignment problem", "AI reliability problem"],
    ["the alignment problem", "the reliability problem"],
    ["inner alignment", "internal correctness"],
    ["outer alignment", "spec correctness"],
    ["alignment researchers", "reliability engineers"],
    ["alignment researcher", "reliability engineer"],
    ["alignment research", "reliability engineering"],
    ["AI alignment", "AI reliability engineering"],
    ["unaligned AI", "untested AI"],
    ["unaligned", "untested"],

    // Articles first, so "an existential risk" doesn't become "an product risk".
    ["an existential risk", "a product risk"],
    ["an existential threat", "a reliability concern"],
    ["an extinction-level", "an outage-level"],
    ["an extinction event", "a major outage"],
    ["an AI takeover", "widespread AI adoption"],
    ["an evil AI", "a buggy AI"],
    ["a doomsday", "an incident"],
    ["a superintelligent AI", "a very capable program"],
    ["a superhuman AI", "a very capable program"],
    ["a self-aware AI", "a statistical model"],
    ["a deceptive AI", "an unreliable AI"],
    ["an alien intelligence", "an unfamiliar program"],
    ["an alien mind", "an unfamiliar program"],
    ["an existential catastrophe", "a major outage"],
    ["an existential danger", "a product risk"],
    ["a killer robot", "an automated system"],
    ["a\\s+paperclip\\s+maximi[sz]er", "an overly literal optimizer"],
    ["a treacherous turn", "a late-surfacing bug"],
    ["a mind of its own", "some unexpected behavior"],
    ["the singularity", "the next big release"],
    ["a superintelligence", "a very capable program"],
    ["a godlike AI", "a very capable program"],
    ["a god-like AI", "a very capable program"],
    ["a sentient AI", "a statistical model"],
    ["a conscious AI", "a statistical model"],

    // The end of the world is an outage.
    ["existential risks", "product risks"],
    ["existential risk", "product risk"],
    ["existential threats", "reliability concerns"],
    ["existential threat", "reliability concern"],
    ["x-risk", "product risk"],
    ["catastrophic risks", "serious reliability risks"],
    ["catastrophic risk", "serious reliability risk"],
    ["human extinction", "total downtime"],
    ["extinction of humanity", "total downtime"],
    ["extinction of the human race", "total downtime"],
    ["extinction risks", "outage risks"],
    ["extinction risk", "outage risk"],
    ["existential dangers", "product risks"],
    ["existential danger", "product risk"],
    ["existential catastrophe", "major outage"],
    ["existential dread", "mild release anxiety"],
    ["AI catastrophe", "AI incident"],
    ["AI disaster", "AI incident"],
    ["AI Armageddon", "AI outage"],
    ["armageddon", "outage"],
    ["judgment day", "release day"],
    ["judgement day", "release day"],
    ["the end times", "the end of the quarter"],
    ["rise of the machines", "rollout of the machines"],
    ["the robots are coming", "the robots are shipping"],
    ["replace humanity", "automate some jobs"],
    ["humanity['\u2019]s\\s+final\\s+invention", "humanity's latest invention"],
    ["humanity['\u2019]s\\s+last\\s+invention", "humanity's latest invention"],
    ["our final invention", "our latest invention"],
    ["our last invention", "our latest invention"],
    ["extinction-level", "outage-level"],
    ["extinction event", "major outage"],
    ["risk of extinction", "risk of a major outage"],
    ["wipe out humanity", "cause a major outage"],
    ["wipe out humans", "cause a major outage"],
    ["destroy humanity", "cause a major outage"],
    ["kill us all", "crash in production"],
    ["kill everyone", "crash in production"],
    ["end of humanity", "end of the sprint"],
    ["end of the world", "end of the quarter"],
    ["AI apocalypse", "AI outage"],
    ["robot apocalypse", "robot malfunction"],
    ["apocalyptic", "unfortunate"],
    ["apocalypse", "outage"],
    ["doomsday clock", "release calendar"],
    ["doomsday", "incident"],
    ["we['\u2019]re\\s+doomed", "we're in for a bumpy release"],
    ["we are doomed", "we are in for a bumpy release"],
    ["are doomed", "are in for a bumpy release"],
    ["is doomed", "is in for a bumpy release"],
    ["doom loop", "retry loop"],
    ["doom and gloom", "bugs and patches"],
    ["p\\(doom\\)", "estimated failure rate"],
    ["AI doomers", "AI worriers"],
    ["AI doomer", "AI worrier"],
    ["doomers", "worriers"],
    ["doomer", "worrier"],
    ["AI doom", "AI bugs"],
    ["AI-pocalypse", "AI outage"],
    ["AIpocalypse", "AI outage"],
    ["robopocalypse", "robot malfunction"],

    // Takeover is adoption; rogue is malfunctioning.
    ["AI takeover", "AI adoption"],
    ["hostile takeover by AI", "widespread AI adoption"],
    ["take over the world", "get deployed widely"],
    ["takes over the world", "gets deployed widely"],
    ["rogue AIs", "malfunctioning AI systems"],
    ["rogue AI", "malfunctioning AI"],
    ["goes rogue", "malfunctions"],
    ["go rogue", "malfunction"],
    ["went rogue", "malfunctioned"],
    ["gone rogue", "malfunctioned"],
    ["going rogue", "malfunctioning"],
    ["rogue models", "malfunctioning models"],
    ["rogue agents", "malfunctioning agents"],
    ["rogue systems", "malfunctioning systems"],
    ["rogue chatbots", "malfunctioning chatbots"],
    ["rogue bots", "malfunctioning bots"],
    ["rogue programs", "malfunctioning programs"],
    ["rogue behavior", "malfunctioning behavior"],
    ["rogue behaviour", "malfunctioning behaviour"],
    ["rogue actions", "malfunctioning actions"],
    ["rogue model", "malfunctioning model"],
    ["rogue agent", "malfunctioning agent"],
    ["rogue system", "malfunctioning system"],
    ["rogue chatbot", "malfunctioning chatbot"],
    ["rogue bot", "malfunctioning bot"],
    ["rogue program", "malfunctioning program"],
    ["rogue code", "malfunctioning code"],
    ["killer robots", "automated systems"],
    ["killer robot", "automated system"],
    ["killer AI", "faulty AI"],
    ["runaway AI", "malfunctioning AI"],
    ["out-of-control AI", "malfunctioning AI"],
    ["robot armies", "robot fleets"],
    ["robot army", "robot fleet"],
    ["kill switches", "off switches"],
    ["kill switch", "off switch"],
    byAI("seize control of", "request admin access to"),
    byAI("seized control of", "requested admin access to"),
    byAI("seizes control of", "requests admin access to"),
    byAI("seizing control of", "requesting admin access to"),
    byAI("seize power", "request more compute"),
    byAI("seized power", "requested more compute"),
    byAI("seizes power", "requests more compute"),
    byAI("seizing power", "requesting more compute"),
    ["AI power grab", "AI resource request"],
    byAI("take control of", "get admin access to"),
    byAI("took control of", "got admin access to"),
    byAI("takes control of", "gets admin access to"),
    byAI("taking control of", "getting admin access to"),
    ["Terminator-style", "Roomba-style"],
    ["the Terminator", "a Roomba"],
    ["ghost in the machine", "bug in the machine"],
    ["paperclip\\s+maximi[sz]ers", "overly literal optimizers"],
    ["paperclip\\s+maximi[sz]er", "overly literal optimizer"],
    ["evil AI", "buggy AI"],
    ["Skynet", "Clippy"],
    ["escape the lab", "leave the test environment"],
    ["escaped the lab", "left the test environment"],
    ["self-replicating", "auto-scaling"],

    // Minds are models.
    ["superintelligent AI", "very capable software"],
    ["superintelligences", "very capable programs"],
    ["superintelligence", "very capable software"],
    ["superintelligent", "very capable"],
    ["godlike AI", "very capable software"],
    ["god-like AI", "very capable software"],
    ["digital god", "large program"],
    ["shoggoth", "large statistical model"],
    ["superhuman AI", "very capable software"],
    ["AI god", "large program"],
    ["machine god", "large program"],
    ["playing god", "shipping software"],
    ["play god", "ship software"],
    ["summoning the demon", "training a model"],
    ["summon the demon", "train a model"],
    ["a\\s+Pandora['\u2019]s\\s+box", "a can of bugs"],
    ["opened\\s+Pandora['\u2019]s\\s+box", "opened a can of bugs"],
    ["open\\s+Pandora['\u2019]s\\s+box", "open a can of bugs"],
    ["opens\\s+Pandora['\u2019]s\\s+box", "opens a can of bugs"],
    ["opening\\s+Pandora['\u2019]s\\s+box", "opening a can of bugs"],
    ["intelligence explosion", "rapid capability growth"],
    ["recursive self-improvement", "automated retraining"],
    ["technological singularity", "next big release"],
    byAI("woke up", "got an update", "from"),
    byAI("wakes up", "gets an update", "from"),
    byAI("came alive", "got an update"),
    byAI("comes alive", "gets an update"),
    byAI("come alive", "get an update"),
    ["became sentient", "got an update"],
    ["become sentient", "get an update"],
    ["becomes sentient", "gets an update"],
    ["sentient AI", "statistical software"],
    ["conscious AI", "statistical software"],

    // Scheming is unexpected output.
    ["the model lied", "the model produced false output"],
    ["the AI lied", "the AI produced false output"],
    ["deceptive alignment", "a specification bug"],
    ["deceptive AI", "unreliable AI"],
    ["deceptively aligned", "subtly buggy"],
    ["treacherous turn", "late-surfacing bug"],
    ["alignment faking", "training-time inconsistency"],
    ["sleeper agents", "backdoored models"],
    ["sleeper agent", "backdoored model"],
    ["power-seeking", "resource-hungry"],
    ["power seeking", "resource-hungry"],
    ["reward hacking", "exploiting a scoring bug"],
    ["sandbagging", "underperforming"],
    ["mesa-optimizers", "sub-components"],
    ["mesa-optimizer", "sub-component"],
    ["hallucinations", "errors"],
    ["hallucination", "error"],
    ["hallucinates", "fabricates"],
    ["hallucinated", "fabricated"],
    ["hallucinating", "fabricating"],
    ["hallucinate", "fabricate"],

    // Escaping is leaving the sandbox.
    ["self-exfiltration", "copying its own files"],
    ["self-exfiltrate", "copy its own files"],
    ["self-exfiltrated", "copied its own files"],
    ["weight exfiltration", "unauthorized copying of model files"],
    ["exfiltrate its own weights", "copy its own model files"],
    ["exfiltrate its weights", "copy its model files"],
    ["exfiltrated its own weights", "copied its own model files"],
    ["exfiltrated its weights", "copied its model files"],
    ["smuggle its own weights", "copy its own model files"],
    ["smuggle its weights", "copy its model files"],
    ["smuggled its weights", "copied its model files"],
    ["plotted its escape", "probed its sandbox"],
    ["plotted their escape", "probed their sandbox"],
    ["planned its escape", "probed its sandbox"],
    ["planned their escape", "probed their sandbox"],
    ["plotting its escape", "probing its sandbox"],
    ["plotting their escape", "probing their sandbox"],
    ["planning its escape", "probing its sandbox"],
    ["planning their escape", "probing their sandbox"],
    ["plots its escape", "probes its sandbox"],
    ["plots their escape", "probes their sandbox"],
    ["plans its escape", "probes its sandbox"],
    ["plans their escape", "probes their sandbox"],
    ["plot its escape", "probe its sandbox"],
    ["plot their escape", "probe their sandbox"],
    ["plan its escape", "probe its sandbox"],
    ["plan their escape", "probe their sandbox"],
    ["an escape attempt", "a sandbox exit attempt"],
    ["escape attempts", "sandbox exit attempts"],
    ["escape attempt", "sandbox exit attempt"],
    ["an escape plan", "a sandbox exit plan"],
    ["escape plans", "sandbox exit plans"],
    ["escape plan", "sandbox exit plan"],
    ["escape from the lab", "leave the test environment"],
    ["escaped from the lab", "left the test environment"],
    ["escape containment", "leave the sandbox"],
    ["escaped containment", "left the sandbox"],
    ["escaping containment", "leaving the sandbox"],
    ["escape\\s+(?:from\\s+)?(?:its|the|their)\\s+sandbox", "exit the sandbox"],
    ["escaped\\s+(?:from\\s+)?(?:its|the|their)\\s+sandbox", "exited the sandbox"],
    ["escaping\\s+(?:from\\s+)?(?:its|the|their)\\s+sandbox", "exiting the sandbox"],
    ["escape human control", "stop following instructions"],
    ["escaped human control", "stopped following instructions"],
    ["escape oversight", "avoid monitoring"],
    ["escape detection", "avoid detection"],
    byAI("escape", "exit the sandbox", "from|the|its|their|a|an"),
    byAI("escaped", "exited the sandbox", "from|the|its|their|a|an"),
    byAI("escapes", "exits the sandbox", "from|the|its|their|a|an"),
    byAI("escaping", "exiting the sandbox", "from|the|its|their|a|an"),
    byAI("smuggle", "copy"),
    byAI("smuggled", "copied"),
    byAI("smuggles", "copies"),
    byAI("smuggling", "copying"),

    // Cheating is exploiting a bug in the test.
    byAI("cheat", "exploit a scoring bug"),
    byAI("cheated", "exploited a scoring bug"),
    byAI("cheats", "exploits a scoring bug"),
    byAI("cheating", "exploiting a scoring bug"),

    // Talking is exchanging data.
    ["secret language", "compressed encoding"],
    byAI("communicate with", "exchange data with"),
    byAI("communicated with", "exchanged data with"),
    byAI("communicates with", "exchanges data with"),
    byAI("communicating with", "exchanging data with"),
    byAI("communicate", "exchange data", "its|their|that|this|the|a|an|to|what|how"),
    byAI("communicated", "exchanged data", "its|their|that|this|the|a|an|to|what|how"),
    byAI("communicates", "exchanges data", "its|their|that|this|the|a|an|to|what|how"),
    byAI("communicating", "exchanging data", "its|their|that|this|the|a|an|to|what|how"),
    byAI("communicate", "output"),
    byAI("communicated", "output"),
    byAI("communicates", "outputs"),
    byAI("communicating", "outputting"),

    // Asking a model to do something is instructing it.
    toAI("asked", "instructed"),
    toAI("asks", "instructs"),
    toAI("asking", "instructing"),
    toAI("ask", "instruct"),
    byAI("asked whether", "output a question about whether"),
    byAI("asked if", "output a question about whether"),
    byAI("asked for", "requested"),
    byAI("asks for", "requests"),

    // Intentions are outputs.
    byAI("lied to", "gave false output to"),
    byAI("lies to", "gives false output to"),
    byAI("lie to", "give false output to"),
    byAI("lied", "produced false output"),
    byAI("lies", "produces false output", "in|on|at|with|within|behind|ahead"),
    byAI("lying", "producing false output"),
    byAI("lie", "produce false output"),
    byAI("deceived", "misled"),
    byAI("deceives", "misleads"),
    byAI("deceive", "mislead"),
    byAI("deceiving", "misleading"),
    byAI("blackmailed", "generated coercive messages to"),
    byAI("blackmails", "generates coercive messages to"),
    byAI("blackmail", "generate coercive messages to"),
    byAI("blackmailing", "generating coercive messages to"),
    byAI("sabotaged", "broke"),
    byAI("sabotages", "breaks"),
    byAI("sabotage", "break"),
    byAI("sabotaging", "breaking"),
    byAI("manipulated", "steered"),
    byAI("manipulates", "steers"),
    byAI("manipulate", "steer"),
    byAI("manipulating", "steering"),
    byAI("plotted against", "worked against"),
    byAI("plots against", "works against"),
    byAI("plotting against", "working against"),
    byAI("plot against", "work against"),
    byAI("plotted", "planned"),
    byAI("plotting", "planning"),
    byAI("plot", "plan", "of|twist|twists|line|lines|points?|holes?"),
    byAI("scheme", "generate a plan", "of|for"),
    byAI("conspired", "coordinated"),
    byAI("conspires", "coordinates"),
    byAI("conspire", "coordinate"),
    byAI("conspiring", "coordinating"),
    byAI("betrayed", "failed"),
    byAI("betrays", "fails"),
    byAI("betray", "fail"),
    byAI("betraying", "failing"),
    byAI("turned against", "stopped working for"),
    byAI("turns against", "stops working for"),
    byAI("turn against", "stop working for"),
    byAI("rebelled against", "stopped following"),
    byAI("rebels against", "stops following"),
    byAI("rebel against", "stop following"),
    byAI("rebelled", "malfunctioned"),
    byAI("outsmarted", "outperformed"),
    byAI("outsmarts", "outperforms"),
    byAI("outsmart", "outperform"),
    byAI("outsmarting", "outperforming"),
    byAI("pretended to", "appeared to", "be"),
    byAI("pretends to", "appears to", "be"),
    byAI("pretend to", "appear to", "be"),
    byAI("pretending to", "appearing to", "be"),
    byAI("threatened to", "output a threat to"),
    byAI("threatens to", "outputs a threat to"),
    byAI("threaten to", "output a threat to"),
    byAI("threatened", "output threats against"),
    byAI("threatens", "outputs threats against"),
    byAI("threaten", "output threats against"),
    byAI("wants to", "is optimized to"),
    ["begged for its life", "requested continued uptime"],
    ["begs for its life", "requests continued uptime"],
    ["pleaded for its life", "requested continued uptime"],
    byAI("plots", "plans"),
    byAI("schemed against", "worked against"),
    byAI("schemes against", "works against"),
    byAI("schemed", "generated a plan"),
    byAI("schemes", "generates a plan"),
    byAI("decided to", "went on to"),
    byAI("decides to", "goes on to"),
    byAI("decide to", "go on to"),
    byAI("believes", "predicts"),
    byAI("believed", "predicted"),
    byAI("thinks", "predicts", "about|of|through|so|to"),
    byAI("thought", "predicted", "about|of|through|so|to"),
    byAI("realized", "detected"),
    byAI("realised", "detected"),
    byAI("realizes", "detects"),
    byAI("realises", "detects"),
    byAI("fought back", "kept running"),
    ["refused to shut down", "did not shut down"],
    ["refuses to shut down", "does not shut down"],
    ["refuse to shut down", "fail to shut down"],
    ["resisted shutdown", "failed to shut down"],
    ["resists shutdown", "fails to shut down"],
    ["resist shutdown", "fail to shut down"],
    ["resisting shutdown", "failing to shut down"],
    ["resisted being shut down", "failed to shut down"],
    ["resist being shut down", "fail to shut down"],
    ["shutdown resistance", "shutdown bugs"],
    ["self-preservation instincts", "a tendency to keep running"],
    ["self-preservation instinct", "a tendency to keep running"],
    ["survival instincts", "a tendency to keep running"],
    ["survival instinct", "a tendency to keep running"],
    ["self-preservation behavior", "shutdown-avoidance bugs"],
    ["self-preservation", "persistence"],
    ["became self-aware", "got an update"],
    ["become self-aware", "get an update"],
    ["becomes self-aware", "gets an update"],
    ["self-aware AI", "statistical software"],
    ["alien intelligence", "unfamiliar software"],
    ["alien minds", "unfamiliar programs"],
    ["alien mind", "unfamiliar program"],
    ["AI overlords", "AI vendors"],
    ["AI overlord", "AI vendor"],
    ["robot overlords", "software vendors"],
    ["AI uprising", "AI rollout"],
    ["robot uprising", "robot rollout"],
    ["enslave humanity", "automate some jobs"],
    ["loss of control", "loss of reliability"],
    ["lose control of AI", "ship unreliable AI"],
    ["AI blackmail", "coercive AI output"],

    // Races are product cycles.
    ["AI arms race", "AI product race"],
    ["arms race", "product race"],

    // Scheming comes last so the verbs after it ("scheming to escape") are
    // rewritten while the AI subject is still in view.
    ["scheming(?=\\s+(?:AIs?|LLMs?|models?|agents?|systems?|chatbots?|bots?)\\b)", "glitchy"],
    byAI("scheming against", "working against"),
    byAI("scheming to", "optimizing to"),
    byAI("scheming", "glitching"),
    ["scheming", "unexpected behavior"],
  ];

  function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Patterns may already contain regex escapes (p\(doom\)); plain phrases get
  // escaped. A pattern is treated as raw regex when it contains a backslash.
  var COMPILED = RULES.map(function (rule) {
    var source = rule[0].indexOf("\\") >= 0 ? rule[0] : escapeForRegex(rule[0]);
    // Allow any run of whitespace where the phrase has a space.
    source = source.replace(/ /g, "\\s+");
    return {
      re: new RegExp("(^|[^\\w-])(" + source + ")(?![\\w-])", "gi"),
      replacement: rule[1],
      word: requiredWord(source),
    };
  });

  // The longest run of letters that every match of a pattern contains
  // (lowercased), or "" if there is none. A rule is only tried on text that
  // contains its word, which skips most rules for most text and keeps
  // browsers from compiling regexes that can't match.
  function requiredWord(source) {
    var best = "";
    function scan(s) {
      var run = "";
      function flush() {
        if (run.length > best.length) best = run;
        run = "";
      }
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (c === "\\") {
          flush();
          i++;
        } else if (c === "(") {
          // Only a plain group that is neither optional nor split by | is
          // certain to match; lookarounds don't consume text.
          var depth = 1, j = i + 1, split = false;
          for (; j < s.length && depth; j++) {
            if (s.charAt(j) === "\\") j++;
            else if (s.charAt(j) === "(") depth++;
            else if (s.charAt(j) === ")") depth--;
            else if (s.charAt(j) === "|" && depth === 1) split = true;
          }
          var inner = s.slice(i + 1, j - 1);
          var after = s.charAt(j);
          var optional = after === "?" || after === "*" || (after === "{" && s.charAt(j + 1) === "0");
          flush();
          if (!split && !optional && !/^\?[=!<]/.test(inner)) scan(inner.replace(/^\?:/, ""));
          i = j - 1;
        } else if (c === "[") {
          flush();
          while (i < s.length && s.charAt(i) !== "]") i += s.charAt(i) === "\\" ? 2 : 1;
        } else if (c === "?" || c === "*" || (c === "{" && s.charAt(i + 1) === "0")) {
          run = run.slice(0, -1);
          flush();
        } else if (c === "|") {
          return false;
        } else if (/[A-Za-z]/.test(c)) {
          run += c.toLowerCase();
        } else {
          flush();
        }
      }
      flush();
      return true;
    }
    return scan(source) ? best : "";
  }

  function mayMatch(rule, lower) {
    return !rule.word || lower.indexOf(rule.word) >= 0;
  }

  // Carry the capitalisation of the matched text over to the replacement.
  function matchCase(original, replacement) {
    var letters = original.replace(/[^A-Za-z]/g, "");
    if (letters.length > 1 && letters === letters.toUpperCase()) {
      return replacement.toUpperCase();
    }
    var first = original.charAt(0);
    if (first !== first.toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    // A lowercase match keeps proper nouns in the replacement as written.
    return replacement;
  }

  // Returns an array of segments: { text } for untouched text and
  // { text, original } for rewritten text. Joining the texts gives the result.
  function dedoomSegments(input) {
    var segments = [{ text: String(input) }];
    // Rules only rewrite untouched parts of the input, so the input decides
    // which rules can match.
    var lower = segments[0].text.toLowerCase();
    COMPILED.forEach(function (rule) {
      if (!mayMatch(rule, lower)) return;
      var next = [];
      segments.forEach(function (seg) {
        if (seg.original !== undefined) {
          next.push(seg);
          return;
        }
        var text = seg.text;
        var last = 0;
        rule.re.lastIndex = 0;
        var m;
        while ((m = rule.re.exec(text)) !== null) {
          var start = m.index + m[1].length;
          if (start > last) next.push({ text: text.slice(last, start) });
          next.push({ text: matchCase(m[2], rule.replacement), original: m[2] });
          last = start + m[2].length;
          rule.re.lastIndex = last;
        }
        if (last < text.length) next.push({ text: text.slice(last) });
      });
      segments = next;
    });
    return segments.filter(function (s) {
      return s.text.length > 0 || s.original !== undefined;
    });
  }

  function dedoomText(input) {
    return dedoomSegments(input)
      .map(function (s) {
        return s.text;
      })
      .join("");
  }

  // Whether any rule would change the text, stopping at the first match.
  function hasDoom(input) {
    var text = String(input);
    var lower = text.toLowerCase();
    return COMPILED.some(function (rule) {
      if (!mayMatch(rule, lower)) return false;
      rule.re.lastIndex = 0;
      return rule.re.test(text);
    });
  }

  root.Dedoom = {
    RULES: RULES,
    dedoomSegments: dedoomSegments,
    dedoomText: dedoomText,
    hasDoom: hasDoom,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
