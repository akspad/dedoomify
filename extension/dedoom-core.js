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
    ["human extinction", "a very bad outage"],
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
    ["doomsday", "incident"],
    ["p\\(doom\\)", "estimated failure rate"],
    ["AI doomers", "AI worriers"],
    ["AI doomer", "AI worrier"],
    ["doomers", "worriers"],
    ["doomer", "worrier"],
    ["AI doom", "AI bugs"],

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
    ["killer robots", "automated systems"],
    ["killer AI", "faulty AI"],
    ["evil AI", "buggy AI"],
    ["Skynet", "a flaky server"],
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
    ["scheming", "unexpected behavior"],
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

    // Races are product cycles.
    ["AI arms race", "AI product race"],
    ["arms race", "product race"],
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
    };
  });

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
    COMPILED.forEach(function (rule) {
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

  root.Dedoom = {
    RULES: RULES,
    dedoomSegments: dedoomSegments,
    dedoomText: dedoomText,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
