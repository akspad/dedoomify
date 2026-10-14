import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../shared/dedoom-core.js';

// Disable only candidate selection: the reference runs every regex, including
// in human-context checks. Compare segments as well as text so protected quotes
// and hover annotations cannot silently change when the index is optimized.
const source = fs.readFileSync(new URL('../shared/dedoom-core.js', import.meta.url), 'utf8');
const reference = {};
vm.runInNewContext(source
  .replace('candidateRules(text).some', 'COMPILED.some')
  .replace('candidateRules(String(input)).forEach', 'COMPILED.forEach'), reference);

test('indexed rules match unfiltered processing across context and overlapping phrases', () => {
  const phrases = [
    'misaligned', 'misalignment', 'alignment fake', 'alignment fakes',
    'scheming', 'scheming-like behaviour', 'scheming reasoning',
    'secretly schemed against its users', 'drifted into misalignment',
    'is misaligned beside the federal agent',
    'deceived the misaligned federal agent', 'blackmailed the federal agent',
    'shows contractor sycophancy', 'uses a hidden scratchpad',
    'exhibits peer-preservation tendencies', 'shows peer loyalty',
    'is an existential risk', 'has a will of its own',
    'hyperstition AI systems into misalignment', 'AI villain data',
    'game fixed reward models', 'a rogue internal deployment',
    'misaligned personas', 'goal-preservation', 'p(doom)',
    'This paragraph contains ordinary words about published research.',
  ];
  for (const phrase of phrases) {
    for (const input of [phrase, `The model ${phrase}.`, `The politician ${phrase}. The AI is misaligned.`,
      `She said, “The model ${phrase}.” The model is misaligned.`, phrase.toUpperCase(),
      phrase.replaceAll(' ', '\n'), `un${phrase}suffix`, `${phrase}. ${phrase}.`]) {
      for (const options of [undefined, { heading: true }]) {
        assert.equal(JSON.stringify(globalThis.Dedoom.dedoomSegments(input, options)),
          JSON.stringify(reference.Dedoom.dedoomSegments(input, options)), input);
      }
    }
  }
});
