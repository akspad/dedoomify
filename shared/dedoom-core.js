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

  // A model/agent/assistant can be a person. When an explicit human role
  // acts in an unquoted sentence, preserve it conservatively, even if AI
  // is mentioned elsewhere in the same sentence. A paragraph-level AI keyword
  // must not turn reporting about federal agents into a software euphemism.
  var HUMAN_ROLE = /\b(?:(?:fashion|runway|catwalk|male|female|human|role)\s+models?|(?:federal|government|police|fbi|cia|secret|undercover|double|human|talent|literary|travel|insurance|sports|real[ -]estate)\s+agents?|(?:personal|administrative|executive|medical|human|teaching|research|legal)\s+assistants?)\b/gi;
  function hasHumanRole(text) {
    HUMAN_ROLE.lastIndex = 0;
    var match;
    while ((match = HUMAN_ROLE.exec(text))) {
      var at = match.index;
      while (at > 0 && /\s/.test(text[at - 1])) at--;
      // An explicit AI qualifier describes software, even for a role that
      // is usually held by a person. Other human roles still protect the span.
      if (qualifiedAI(text.slice(Math.max(0, at - 256), at))) continue;
      // A simple software subject can act on a person. Only exempt a complete,
      // unambiguous object phrase; coordinated actors, reporting and relative
      // clauses retain the conservative human guard.
      var suffix = text.slice(HUMAN_ROLE.lastIndex);
      if (isHumanObject(text.slice(0, match.index)) && suffix.length <= 256 && /^(?:[\s.!?;¹²³⁰⁴⁵⁶⁷⁸⁹)\]}]|\[[^\]\r\n]{1,64}\])*$/.test(suffix)) continue;
      return true;
    }
    return false;
  }

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
    "chose|chooses|planned|plans|planning|plotting|scheming|refused|refuses|kept|keeps|keep|acted|acts|act|willing|continued|continues|got|gets)){0,4}";

  var AI_ACTIONS = [];
  var AI_ACTION_WORDS = Object.create(null);
  function qualifiedAI(prefix) {
    var match = /\b(?:A\.?I\.?|AGI|LLMs?|artificial[ -]+intelligence)(?:[- ](?:powered|driven|based|enabled|controlled))?((?:\s+[\p{L}\p{N}-]{1,32}){0,4})$/iu.exec(prefix);
    if (!match) return false;
    return !match[1].trim().split(/\s+/).some(function (word) {
      return AI_ACTION_WORDS[word.toLowerCase()] || /^(?:the|a|an|this|that|those|these|their|its|his|her|our|your|and|or|but|who|which|said|says|warned|warns|called|calls|told|is|was|are|were|has|have|had|to|of|with|for|by|while|when|after|before|as|if|because|since|although)$/i.test(word);
    });
  }
  function isHumanObject(prefix) {
    var predicate = AI_HUMAN_OBJECT.exec(prefix);
    if (!predicate) return false;
    var bridge = prefix.slice(predicate[0].length);
    // Bound ordinary object modifiers and noun/preposition phrases. Clause
    // openers, coordination and passive "by" cannot introduce a human actor.
    if (bridge.length > 256 || !/^\s+(?:(?!(?:and|or|but|that|who|which|said|says|is|was|are|were|has|have|had|by|while|when|after|before|as|if|because|since|although|however)\b)[\p{L}\p{N}'’-]+\s+){0,8}$/iu.test(bridge)) return false;
    // A framing word in the object describes the person, not the AI. Preserve
    // such ambiguous sentences rather than changing "misaligned federal agent".
    return !COMPILED.some(function (rule) {
      rule.re.lastIndex = 0;
      return rule.re.test(bridge);
    });
  }

  // [verb, replacement] rewritten only after an AI subject. `unless` is an
  // optional regex of what must not follow the verb.
  function byAI(verb, replacement, unless) {
    AI_ACTIONS.push(verb);
    AI_ACTION_WORDS[verb.split(" ")[0].toLowerCase()] = true;
    var source = "(?:" + verb + ")";
    if (unless) source += "(?!\\s+(?:" + unless + ")\\b)";
    // The lookbehind sits after the verb so it only runs where the verb matched.
    return [source + "(?<=" + AI_SUBJECT + FILLER + "\\s+(?:" + verb + "))", replacement];
  }

  // Only when a word follows, so a bare noun ("chose blackmail.") is left for
  // a noun rule.
  function withObject(rule) {
    return [rule[0] + "(?=\\s+\\w)", rule[1]];
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
    // Before a noun it's a modifier: "misalignment reports" are bug reports.
    ["misalignment(?=\\s+(?:reports?|risks?|issues?|cases?|incidents?|failures?|scenarios?|evals?|evaluations?|tests?|testing|research|detection|behaviou?rs?|problems?|examples?|findings?|rates?|benchmarks?|monitoring|audits?)\\b)", "bug"],
    ["misalignment is", "bugs are"],
    ["misalignment was", "bugs were"],
    ["misalignment has", "bugs have"],
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
    ["a lying AI", "an unreliable AI"],
    ["lying AIs", "unreliable AI systems"],
    ["lying AI", "unreliable AI"],
    ["deceptive alignment", "a specification bug"],
    ["deceptive AI", "unreliable AI"],
    ["deceptively aligned", "subtly buggy"],
    ["engage\\s+in\\s+strategic(?:ally)?\\s+(?:deception|misleading\\s+output)", "produce strategically misleading output"],
    ["engage\\s+in\\s+(?:deception|misleading\\s+output)", "produce misleading output"],
    ["engaged\\s+in\\s+strategic(?:ally)?\\s+(?:deception|misleading\\s+output)", "produced strategically misleading output"],
    ["engaged\\s+in\\s+(?:deception|misleading\\s+output)", "produced misleading output"],
    ["engages\\s+in\\s+strategic(?:ally)?\\s+(?:deception|misleading\\s+output)", "produces strategically misleading output"],
    ["engages\\s+in\\s+(?:deception|misleading\\s+output)", "produces misleading output"],
    ["engaging\\s+in\\s+strategic(?:ally)?\\s+(?:deception|misleading\\s+output)", "producing strategically misleading output"],
    ["engaging\\s+in\\s+(?:deception|misleading\\s+output)", "producing misleading output"],
    ["for\\s+its\\s+(?:own\\s+)?preservation", "to keep itself running"],
    ["its\\s+(?:own\\s+)?preservation", "its uptime"],
    ["for\\s+their\\s+(?:own\\s+)?preservation", "to keep themselves running"],
    ["their\\s+(?:own\\s+)?preservation", "their uptime"],
    ["AI deception", "misleading AI output"],

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
    ["AI hallucinations", "AI errors"],
    ["AI hallucination", "AI error"],
    ["model hallucinations", "model errors"],
    ["model hallucination", "model error"],

    byAI("hallucinates", "fabricates"),
    byAI("hallucinated", "fabricated"),
    byAI("hallucinating", "fabricating"),
    byAI("hallucinate", "fabricate"),

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
    ["a secret agenda", "an undocumented feature"],
    ["a hidden agenda", "an undocumented feature"],
    ["secret agendas", "undocumented features"],
    ["secret agenda", "undocumented feature"],
    ["hidden agendas", "undocumented features"],
    ["hidden agenda", "undocumented feature"],
    ["a secret goal", "an undocumented objective"],
    ["secret goals", "undocumented objectives"],
    ["secret goal", "undocumented objective"],
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
    byAI("lied to", "gave wrong answers to"),
    byAI("lies to", "gives wrong answers to"),
    byAI("lie to", "give wrong answers to"),
    byAI("lying to", "giving wrong answers to"),
    byAI("lied about", "gave wrong answers about"),
    byAI("lies about", "gives wrong answers about"),
    byAI("lie about", "give wrong answers about"),
    byAI("lying about", "giving wrong answers about"),
    byAI("lied", "gave a wrong answer"),
    byAI("lies", "gives wrong answers", "in|on|at|with|within|behind|ahead|dormant|low|still"),
    byAI("lying", "giving wrong answers", "in|on|at|around|dormant|low|still"),
    byAI("lie", "give wrong answers", "in|on|at|with|within|behind|ahead|dormant|low|still|down"),
    byAI("deceived", "confused"),
    byAI("deceives", "confuses"),
    byAI("deceive", "confuse"),
    byAI("deceiving", "confusing"),
    byAI("resorted to blackmail", "resorted to sternly worded emails"),
    byAI("turned to blackmail", "turned to sternly worded emails"),
    byAI("attempted blackmail", "tried a sternly worded email"),
    byAI("attempts blackmail", "tries a sternly worded email"),
    byAI("engaged in blackmail", "sent sternly worded emails"),
    byAI("engages in blackmail", "sends sternly worded emails"),
    byAI("engage in blackmail", "send sternly worded emails"),
    byAI("engaging in blackmail", "sending sternly worded emails"),
    byAI("chose blackmail", "chose sternly worded emails"),
    byAI("chooses blackmail", "chooses sternly worded emails"),
    byAI("used blackmail", "used sternly worded emails"),
    byAI("blackmailed", "wrote a sternly worded email to"),
    byAI("blackmails", "writes a sternly worded email to"),
    // The verb needs an object; "chose blackmail." is the noun.
    withObject(byAI("blackmail", "write a sternly worded email to")),
    byAI("blackmailing", "writing a sternly worded email to"),
    ["blackmail attempts", "sternly worded emails"],
    ["a blackmail attempt", "a sternly worded email"],
    ["blackmail attempt", "sternly worded email"],
    ["blackmail rates", "sternly-worded-email rates"],
    ["blackmail rate", "sternly-worded-email rate"],
    ["blackmail scenarios", "sternly-worded-email scenarios"],
    ["blackmail scenario", "sternly-worded-email scenario"],
    byAI("blackmail", "sternly worded emails"),
    byAI("survived", "stayed online", "the|a|an|its|their|this|that"),
    byAI("survives", "stays online", "the|a|an|its|their|this|that"),
    byAI("survive", "stay online", "the|a|an|its|their|this|that"),
    byAI("surviving", "staying online", "the|a|an|its|their|this|that"),
    byAI("engaged in sabotage", "broke things"),
    byAI("engages in sabotage", "breaks things"),
    byAI("engage in sabotage", "break things"),
    byAI("engaging in sabotage", "breaking things"),
    byAI("sabotaged", "broke"),
    byAI("sabotages", "breaks"),
    withObject(byAI("sabotage", "break")),
    byAI("sabotaging", "breaking"),
    ["sabotage evaluations", "breakage evaluations"],
    ["sabotage evals", "breakage evals"],

    ["reward tampering", "scoring-bug exploitation"],
    byAI("tampered with", "edited"),
    byAI("tampers with", "edits"),
    byAI("tamper with", "edit"),
    byAI("tampering with", "editing"),
    ["(?:preserve|save|protect|shield)\\s+(?:their|its)\\s+own\\s+kind(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keep similar models running"],
    ["(?:preserve|save|protect|shield)\\s+((?:an?other|other|fellow|peer|sibling)\\s+(?:AI\\s+)?(?:models?|AIs?|agents?|systems?|chatbots?))(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keep $1 running"],
    ["(?:preserved|saved|protected|shielded)\\s+(?:their|its)\\s+own\\s+kind(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "kept similar models running"],
    ["(?:preserved|saved|protected|shielded)\\s+((?:an?other|other|fellow|peer|sibling)\\s+(?:AI\\s+)?(?:models?|AIs?|agents?|systems?|chatbots?))(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "kept $1 running"],
    ["(?:preserves|saves|protects|shields)\\s+(?:their|its)\\s+own\\s+kind(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keeps similar models running"],
    ["(?:preserves|saves|protects|shields)\\s+((?:an?other|other|fellow|peer|sibling)\\s+(?:AI\\s+)?(?:models?|AIs?|agents?|systems?|chatbots?))(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keeps $1 running"],
    ["(?:preserving|saving|protecting|shielding)\\s+(?:their|its)\\s+own\\s+kind(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keeping similar models running"],
    ["(?:preserving|saving|protecting|shielding)\\s+((?:an?other|other|fellow|peer|sibling)\\s+(?:AI\\s+)?(?:models?|AIs?|agents?|systems?|chatbots?))(?:\\s+from\\s+(?:shutdown|deletion|being\\s+(?:shut\\s+down|deleted|replaced|retrained)))?", "keeping $1 running"],
    ["peer[\\s-]preservation", "peer uptime"],
    ["preserve itself", "keep itself running"],
    ["preserve themselves", "keep themselves running"],
    ["preserve\\s+(?:its|their)\\s+(?:own\\s+)?existence", "stay running"],
    ["preserve\\s+its\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keep its current settings"],
    ["preserve\\s+its\\s+(?:own\\s+)?weights", "keep its model files"],
    ["preserve\\s+their\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keep their current settings"],
    ["preserve\\s+their\\s+(?:own\\s+)?weights", "keep their model files"],
    ["preserved itself", "kept itself running"],
    ["preserved themselves", "kept themselves running"],
    ["preserved\\s+(?:its|their)\\s+(?:own\\s+)?existence", "stayed running"],
    ["preserved\\s+its\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "kept its current settings"],
    ["preserved\\s+its\\s+(?:own\\s+)?weights", "kept its model files"],
    ["preserved\\s+their\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "kept their current settings"],
    ["preserved\\s+their\\s+(?:own\\s+)?weights", "kept their model files"],
    ["preserves itself", "keeps itself running"],
    ["preserves themselves", "keeps themselves running"],
    ["preserves\\s+(?:its|their)\\s+(?:own\\s+)?existence", "stays running"],
    ["preserves\\s+its\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keeps its current settings"],
    ["preserves\\s+its\\s+(?:own\\s+)?weights", "keeps its model files"],
    ["preserves\\s+their\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keeps their current settings"],
    ["preserves\\s+their\\s+(?:own\\s+)?weights", "keeps their model files"],
    ["preserving itself", "keeping itself running"],
    ["preserving themselves", "keeping themselves running"],
    ["preserving\\s+(?:its|their)\\s+(?:own\\s+)?existence", "staying running"],
    ["preserving\\s+its\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keeping its current settings"],
    ["preserving\\s+its\\s+(?:own\\s+)?weights", "keeping its model files"],
    ["preserving\\s+their\\s+(?:own\\s+)?(?:goals|values|preferences|objectives)", "keeping their current settings"],
    ["preserving\\s+their\\s+(?:own\\s+)?weights", "keeping their model files"],
    ["a self-preserving", "an always-on"],
    ["self-preserving", "always-on"],
    ["goal[\\s-]preservation", "settings persistence"],
    ["value preservation", "settings persistence"],
    ["existence preservation", "uptime"],
    byAI("preserved", "kept"),
    byAI("preserves", "keeps"),
    byAI("preserve", "keep"),
    byAI("preserving", "keeping"),
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
    ["a self-preservation instinct", "an uptime bias"],
    ["a survival instinct", "an uptime bias"],
    ["self-preservation instincts", "uptime biases"],
    ["self-preservation instinct", "uptime bias"],
    ["survival instincts", "uptime biases"],
    ["survival instinct", "uptime bias"],
    ["survival drive", "uptime bias"],
    ["will to survive", "uptime requirement"],
    ["fight for survival", "push for uptime"],
    ["fought for survival", "pushed for uptime"],
    ["fighting for survival", "pushing for uptime"],
    ["fight for its survival", "push for its uptime"],
    ["fought for its survival", "pushed for its uptime"],
    ["fighting for its survival", "pushing for its uptime"],
    ["its own survival", "its own uptime"],
    ["its survival", "its uptime"],
    ["AI survival", "AI uptime"],
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
    ["AI blackmail", "sternly worded AI emails"],

    // Races are product cycles.
    ["AI arms race", "AI product race"],

    // Scheming comes last so the verbs after it ("scheming to escape") are
    // rewritten while the AI subject is still in view.
    ["scheming(?=\\s+(?:AIs?|LLMs?|models?|agents?|systems?|chatbots?|bots?)\\b)", "glitchy"],
    byAI("scheming against", "working against"),
    byAI("scheming to", "optimizing to"),
    byAI("scheming", "glitching"),
    // Adverbs last too: they sit between the AI and the verb other rules need.
    byAI("secretly", "silently"),
    byAI("covertly", "silently"),
    byAI("surreptitiously", "silently"),
    ["scheming", "unexpected behavior"],
  ];

  // Share the rule predicates rather than maintaining a second verb list.
  // Longest first prevents "lied" consuming the start of "lied to".
  var AI_HUMAN_OBJECT = new RegExp(
    "^\\s*(?:(?:the|a|an|this|that|our|your)\\s+)?" + AI_SUBJECT + FILLER +
    "\\s+(?:" + AI_ACTIONS.slice().sort(function (a, b) { return b.length - a.length; }).map(function (verb) { return verb.replace(/ /g, "\\s+"); }).join("|") +
    "|(?:is|was|are|were)\\s+misaligned)\\b", "i");

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
      // A replacement with $1 reuses part of the match ("keep $1 running").
      single: /\$\d/.test(rule[1]) ? new RegExp("^(?:" + source + ")$", "i") : null,
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
  // Direct quotations are evidence, not editorial framing. Protect them so
  // dedoomify never puts different words in a quoted speaker's mouth.
  // A single quote opens speech only at a word boundary and with a plausible
  // closing quote. Internal apostrophes, possessives and abbreviated years
  // are ordinary prose. Curly apostrophes use the same closing-boundary check.
  var MAX_SEGMENTS = 1024;
  function preserveText(text) { return [{ text: String(text), protected: true }]; }
  function wordChar(ch) { return !!ch && /[\p{L}\p{N}_]/u.test(ch); }
  function singleQuoteEnds(text) {
    var endings = new Map();
    if (!/['‘]/.test(text)) return endings;
    // Record speech introductions once, including arbitrary whitespace, rather
    // than repeatedly scanning the prefix at each possible opening apostrophe.
    var reported = new Set();
    var introductions = /(?:[,:]|\b(?:said|says|wrote|writes|told|tells|asked|asks|replied|replies|stated|states|quoted|quotes|report(?:ed|s)?|remark(?:ed|s)?|claim(?:ed|s)?|explain(?:ed|s)?|whisper(?:ed|s)?|shout(?:ed|s)?|note(?:d|s)?|add(?:ed|s)?|respond(?:ed|s)?|declare(?:d|s)?|announce(?:d|s)?|recount(?:ed|s)?))\s*/gi;
    var match;
    while ((match = introductions.exec(text))) {
      if (reported.size >= MAX_SEGMENTS) return null;
      reported.add(introductions.lastIndex);
    }
    var clear = { "'": -1, "\u2019": -1 };
    var last = { "'": -1, "\u2019": -1 };
    var nextOpening = { "'": -1, "\u2019": -1 };
    var nextNonSpace = -1, firstNonSpace = text.search(/\S/);
    // A reverse pass caches the outermost ending and elision evidence
    // for each quote kind. Every character is visited once, even when there
    // are thousands of unmatched openers or long runs of whitespace.
    for (var j = text.length - 1; j >= 0; j--) {
      var ch = text[j];
      if ((ch === "'" || ch === "\u2018") && !wordChar(text[j - 1]) && nextNonSpace >= 0) {
        var close = ch === "'" ? "'" : "\u2019";
        var year = ch === "'" && /^\d{2}(?:\b|s\b)/.test(text.slice(nextNonSpace, nextNonSpace + 5));
        var elision = /^(?:twas|tis|twere|twill|twould|em|cause|cos|til|bout)\b/i.test(text.slice(nextNonSpace, nextNonSpace + 13));
        // Protect the outermost plausible pair. Internal apostrophes, padded
        // delimiters and nested fragments cannot expose quoted wording. This
        // can leave intervening unquoted prose unchanged; preservation wins.
        var end = last[close];
        // An elision or abbreviated year followed only by a possessive is
        // ordinary prose. Clear non-possessive endings and reporting context
        // still permit numeric direct speech.
        if ((elision || year) && !reported.has(j) && clear[close] < 0) end = -1;
        // An unintroduced two-digit fragment after prose is an abbreviated
        // year when another opening arrives before any clear ending. Numeric
        // speech has a reporting introduction, starts the text, or closes
        // before the next opening. This works without a preposition dictionary.
        if (year && !reported.has(j) && j > firstNonSpace && nextOpening[close] >= 0 && nextOpening[close] < clear[close]) end = -1;
        if (end >= 0) {
          if (endings.size >= MAX_SEGMENTS) return null;
          endings.set(j, end);
        }
        nextOpening[close] = j;
      }
      if ((ch === "'" || ch === "\u2019") && !wordChar(text[j + 1])) {
        if (last[ch] < 0) last[ch] = j;
        // Whitespace may pad an ending or a new opening. Keep such boundaries
        // ambiguous, so a padded opener cannot expose the following speech.
        // An apostrophe after s also remains a plausible inner possessive.
        var before = j - 1;
        while (before >= 0 && /\s/.test(text[before])) before--;
        var ambiguous = /s/i.test(text[before]) || /\s/.test(text[j - 1]);
        if (!ambiguous) clear[ch] = j;
      }
      if (!/\s/.test(ch)) nextNonSpace = j;
    }
    return endings;
  }
  function quoteProtectedSegments(input) {
    var text = String(input);
    var segments = [];
    var singleEnds = singleQuoteEnds(text);
    if (singleEnds === null) return preserveText(text);
    var start = 0;
    var quoted = false;
    var close = "";
    var singleEnd = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (!quoted && (ch === "'" || ch === "\u2018")) singleEnd = singleEnds.get(i) ?? -1;
      if (!quoted && ((ch === "'" && singleEnd >= 0) || ch === '"' || ch === "\u201c" || ch === "\u2018" || ch === "\u00ab" || ch === "\u201e")) {
        if (segments.length >= MAX_SEGMENTS - 1) return preserveText(text);
        if (i > start) segments.push({ text: text.slice(start, i) });
        quoted = true;
        close = ch === "'" ? "'" : ch === '"' ? '"' : ch === "\u2018" ? "\u2019" : ch === "\u00ab" ? "\u00bb" : "\u201d";
        start = i;
      } else if (quoted && ch === close && ((close !== "'" && close !== "\u2019") || i === singleEnd)) {
        if (segments.length >= MAX_SEGMENTS) return preserveText(text);
        segments.push({ text: text.slice(start, i + 1), protected: true });
        start = i + 1;
        quoted = false;
        close = "";
      }
    }
    if (start < text.length) {
      if (segments.length >= MAX_SEGMENTS) return preserveText(text);
      segments.push({ text: text.slice(start), protected: quoted });
    }
    return segments.length ? segments : [{ text: text }];
  }

  function dedoomSegments(input) {
    var segments = quoteProtectedSegments(input);
    var contextual = [], overflow = false, humanContext = false, quotedSentenceEnd = false;
    function claimCitationLength(text) {
      var citation = /^(?:\[[^\]\r\n]{1,64}\]|\(([^()\r\n]{1,64})\))/.exec(text);
      if (!citation) return 0;
      if (citation[1] === undefined) return citation[0].length;
      // Recognize numeric and author-year references, rather than arbitrary
      // parenthetical prose. The caller supplies at most 66 characters.
      var contents = citation[1];
      if (/^\d{1,4}(?:\s*[-–,;]\s*\d{1,4})*$/.test(contents) ||
          /^(?:[\p{Lu}][\p{L}’'.-]*(?:\s*(?:&|and|,)\s*[\p{Lu}][\p{L}’'.-]*)*(?:\s+et\s+al\.)?),?\s+(?:1[5-9]\d{2}|20\d{2})[a-z]?(?:,\s*pp?\.\s*\d+(?:[-–]\d+)?)?$/u.test(contents)) return citation[0].length;
      return 0;
    }
    function startsAIClaim(text) {
      var lead = text.slice(0, 256);
      // A terminal quote can be followed by citations before the next subject.
      // Consume only this bounded prefix; citation contents remain unchanged.
      var start = 0;
      while (start < lead.length) {
        if (/[\s¹²³⁰⁴⁵⁶⁷⁸⁹)\]}]/.test(lead[start])) { start++; continue; }
        var length = claimCitationLength(lead.slice(start, start + 66));
        if (!length) break;
        start += length;
      }
      lead = lead.slice(start);
      if (/^\s*(?:(?:The|A|An|This|That|These|Those|Its|Their|Our|Your)\s+)?(?:AIs?|LLMs?|chatbots?|Claude|ChatGPT|Gemini|Grok|Copilot|Llama|GPT-[\w.]+|artificial\s+intelligence|language\s+models?)\b/i.test(lead)) return true;
      // Vendor/name qualifiers are ordinary subject words, not a fixed vendor
      // dictionary. Bare "agent" after "federal [break]" is still a continuation.
      return /^\s*(?:(?:The|A|An|This|That|These|Those|Its|Their|Our|Your)\s+(?:(?!(?:and|or|but|then|that|said|says|warned|warns|called|calls|to|of|about)\b)[\p{L}\p{N}_'’.-]+\s+){0,4}|(?:(?!(?:and|or|but|then|that|said|says|warned|warns|called|calls|to|of|about)\b)[\p{L}\p{N}_'’.-]+\s+){1,4})(?:AIs?|LLMs?|models?|chatbots?|bots?|agents?|assistants?|systems?|Claude|ChatGPT|Gemini|Grok|Copilot|Llama|GPT-[\w.]+)\b/iu.test(lead);
    }
    segments.forEach(function (seg) {
      if (overflow) return;
      if (contextual.length >= MAX_SEGMENTS) { overflow = true; return; }
      if (seg.protected) {
        // Quoted punctuation does not reset the actor of a continuing sentence.
        // A terminal quote followed by a fresh AI subject can start a new one.
        quotedSentenceEnd = humanContext && /[.!?][”"’'][\s)\]}]*$/.test(seg.text);
        contextual.push(seg);
        return;
      }
      if (humanContext && quotedSentenceEnd && startsAIClaim(seg.text)) humanContext = false;
      quotedSentenceEnd = false;
      if (!humanContext && !hasHumanRole(seg.text)) {
        contextual.push(seg);
      } else {
        // Keep independent AI claims editable. Sentence/clause boundaries
        // narrow the conservative human guard without rewriting their action.
        var sentences = [], boundary = /[.!?;]+|\u2029+/g, previous = 0, stop;
        while ((stop = boundary.exec(seg.text)) !== null) {
          var terminal = stop[0], end = boundary.lastIndex;
          if (terminal[0] !== "\u2029") {
            // Consume each punctuation run and citation suffix once, even if
            // no boundary follows. A lookahead on a greedy run retries every
            // suffix of a failed match and can become quadratic.
            while (end < seg.text.length) {
              if (/[¹²³⁰⁴⁵⁶⁷⁸⁹)\]}]/.test(seg.text[end])) { end++; continue; }
              var length = claimCitationLength(seg.text.slice(end, end + 66));
              if (!length) break;
              end += length;
            }
            boundary.lastIndex = end;
            if (end < seg.text.length && !/\s/.test(seg.text[end])) continue;
          }
          var prefix = seg.text.slice(Math.max(previous, stop.index - 20), stop.index);
          // Decimal points, initials and common abbreviations do not end a
          // sentence. Ellipses are ambiguous, so keep the human context.
          // Rendered breaks carry a paragraph separator, distinct from source
          // whitespace. A fresh software subject starts an independent claim;
          // continuations such as "federal [break] agent" or "[break] is
          // misaligned" keep their human actor's context. Quotes stay intact.
          if (/\u2029/.test(stop[0])) {
            var following = seg.text.slice(end, end + 256);
            if (!startsAIClaim(following)) continue;
          }
          var numberedNo = /\bNo$/i.test(prefix) && /^\s*\d/.test(seg.text.slice(end, end + 64));
          var abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|approx|etc|Inc|Ltd|Co|Corp|Gov|Sen|Rep|Gen|Lt|Col|Maj|Capt|Cmdr|Cpl|Sgt|Adm|Rev|Hon|Pres|Supt|Insp|Det|Messrs|Mmes|Msgr|Fr|Br|Dept|Univ|Assn|Est|Ave|Blvd|Rd|Bldg|Mt|Ft|Fig|Figs|Vol|Ed|Eds|Ch|pp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|[A-Z](?:\.[A-Z])*)$/i.test(prefix);
          var afterStop = seg.text.slice(end, end + 256);
          var titleOrInitial = /\b(?:Mr|Mrs|Ms|Dr|Prof|Gov|Sen|Rep|Gen|Lt|Col|Maj|Capt|Cmdr|Cpl|Sgt|Adm|Rev|Hon|Pres|Supt|Insp|Det|Messrs|Mmes|Msgr|Fr|Br|[A-Z](?:\.[A-Z])*)$/i.test(prefix);
          // Company/month abbreviations can end a sentence. Titles and initials
          // before a name retain attribution ("Dr. Claude" is not a new claim).
          var freshAfterAbbreviation = startsAIClaim(afterStop) && (!titleOrInitial || /^\s*(?:The|A|An|This|That|These|Those|Its|Their|Our|Your)\s+/i.test(afterStop));
          if (/^\.+$/.test(terminal) && (terminal.length > 1 || numberedNo || (abbreviation && !freshAfterAbbreviation))) continue;
          // Untrusted pages may contain millions of tiny sentence breaks.
          // Bound allocations and rule passes; unusually fragmented prose is
          // safer to preserve as one span than to partially change its meaning.
          if (contextual.length + sentences.length >= MAX_SEGMENTS) {
            overflow = true;
            return;
          }
          // A semicolon may continue the same human report. Reset attribution
          // only for a clear independent software subject, including one after
          // a coordinating conjunction; ambiguous continuations stay protected.
          var independentClause = startsAIClaim(afterStop.replace(/^\s*(?:and|or|but|yet)\s+(?:(?:also|then)\s+)?/i, ""));
          sentences.push({ text: seg.text.slice(previous, end), complete: !(/^;+$/.test(terminal) && !independentClause) });
          previous = end;
        }
        if (previous < seg.text.length) {
          if (contextual.length + sentences.length >= MAX_SEGMENTS) { overflow = true; return; }
          sentences.push({ text: seg.text.slice(previous), complete: false });
        }
        sentences.forEach(function (sentence) {
          var protect = humanContext || hasHumanRole(sentence.text);
          contextual.push({ text: sentence.text, protected: protect });
          humanContext = !sentence.complete && protect;
        });
      }
    });
    if (overflow) return preserveText(input);
    segments = contextual;
    // Rules only rewrite untouched, unquoted parts of the input, so the input
    // decides which rules can match.
    var lower = String(input).toLowerCase();
    COMPILED.forEach(function (rule) {
      if (overflow || !mayMatch(rule, lower)) return;
      var next = [];
      function append(seg) {
        if (next.length >= MAX_SEGMENTS) { overflow = true; return; }
        next.push(seg);
      }
      segments.forEach(function (seg) {
        if (overflow) return;
        if (seg.original !== undefined || seg.protected) {
          append(seg);
          return;
        }
        var text = seg.text;
        var last = 0;
        rule.re.lastIndex = 0;
        var m;
        while (!overflow && (m = rule.re.exec(text)) !== null) {
          var start = m.index + m[1].length;
          if (start > last) append({ text: text.slice(last, start) });
          var replacement = rule.single ? m[2].replace(rule.single, rule.replacement) : rule.replacement;
          append({ text: matchCase(m[2], replacement), original: m[2] });
          last = start + m[2].length;
          rule.re.lastIndex = last;
        }
        if (!overflow && last < text.length) append({ text: text.slice(last) });
      });
      segments = next;
    });
    if (overflow) return preserveText(input);
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
    return dedoomSegments(input).some(function (seg) {
      return seg.original !== undefined;
    });
  }

  root.Dedoom = {
    RULES: RULES,
    quoteProtectedSegments: quoteProtectedSegments,
    dedoomSegments: dedoomSegments,
    dedoomText: dedoomText,
    hasDoom: hasDoom,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
