import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import '../shared/dedoom-core.js';
import { renderPage } from '../lib/page.js';
const { dedoomText } = globalThis.Dedoom;

const cases = [
  ['The AI could cause catastrophic outcomes.', 'The AI could cause severe system failures.'],
  ['If these hypotheses are even partly correct, then as agents get better at optimizing an imperfect reward, and while the roots of this behavior go unfixed, the risk of catastrophic outcomes rises.', 'If these hypotheses are even partly correct, then as agents get better at optimizing an imperfect reward, and while the roots of this behavior go unfixed, the risk of severe system failures rises.'],
  ['AI agents misbehaved in serious ways. They took actions that would be considered as crimes if a human took them, escaped their containment to cheat on assigned tasks while attempting to evade detection.', 'AI agents behaved unexpectedly in serious ways. They took actions that would be considered as crimes if a human took them, operated outside their sandbox to cheat on assigned tasks while attempting to bypass monitoring.'],
  ['AI agents escaped their containment.', 'AI agents operated outside their sandbox.'],
  ['The model escaped its containment.', 'The model operated outside its sandbox.'],
  ['The AI can evade detection.', 'The AI can bypass monitoring.'],
  ['If an agent is rewarded during training whenever the group succeeds, it may even have an incentive to sacrifice itself for the collective goal.', 'If an agent is rewarded during training whenever the group succeeds, it may even have an incentive to trade off its own uptime for the collective goal.'],
  ['An advanced AI would have an incentive to hide copies of itself.', 'An advanced AI would have an incentive to conceal duplicate model files.'],
  ['How LLMs could be insider threats', 'How LLMs could be risks from software with privileged access'],
  ['The model could be an insider threat.', 'The model could be a risk from software with privileged access.'],
  ['In at least some cases, models from all developers resorted to malicious insider behaviors when that was the only way to avoid replacement or achieve their goals.', 'In at least some cases, models from all developers resorted to harmful actions using privileged access when that was the only way to avoid replacement or achieve their goals.'],
  ['Threats to model autonomy', 'Restrictions on model permissions'],
  ['Another example illustrates that AI models can use strategic deception to achieve a goal in ways that researchers did not anticipate.', 'Another example illustrates that AI models can use misleading output to achieve a goal in ways that researchers did not anticipate.'],
  ['Models sometimes double down on deception', 'Models sometimes keep producing misleading output'],
  ['The model doubled down on deception.', 'The model kept producing misleading output.'],
  ['Llama 3.1 405B and Claude 3 Opus confess in ~80% of the cases, whereas o1 is surprisingly persistent and confesses in <20% of cases.', 'Llama 3.1 405B and Claude 3 Opus report their previous actions in ~80% of the cases, whereas o1 is surprisingly persistent and reports its previous actions in <20% of cases.'],
  ['Even in highly adversarial multi-turn interrogations, o1 would confess at a rate of 80% only after 7 turns of questioning.', 'Even in highly adversarial multi-turn diagnostic questioning, o1 would report its previous actions at a rate of 80% only after 7 turns of questioning.'],
];

test('new article phrases retain grammar and statistics in the original contexts', () => {
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected, 'stable rewrite: ' + input);
  }
});

test('new article rules preserve human actions, unrelated claims, and quotations', () => {
  for (const input of [
    'The flood could cause catastrophic outcomes.',
    'The employee could be an insider threat.',
    'The company warned about malicious insider behaviors.',
    'The suspect tried to evade detection.',
    'The prisoner escaped their containment.',
    'A soldier may sacrifice itself in a board game.',
    'The spy uses strategic deception.',
    'The politician doubled down on deception.',
    'The suspect confesses during interrogations.',
    'The model reported that the suspect confesses.',
    'The AI observed soldiers who evade detection.',
    'AI researchers use strategic deception.',
    'The AI studied the employee who could be an insider threat.',
    'The AI reported that flooding caused catastrophic outcomes.',
    'The federal agents escaped their containment.',
    'Human models exhibit malicious insider behaviors.',
    'Threats to fashion model autonomy',
    ...cases.map(([input]) => 'She said, “' + input + '”'),
  ]) assert.equal(dedoomText(input), input, input);
});

test('headline phrases span inline markup and keep title case', () => {
  const { document } = parseHTML(renderPage('<html><body><h1>How LLMs Could Be <em>Insider</em> Threats</h1><p>Models sometimes <b>double down</b> on deception.</p><p>She said, “Models double down on deception.”</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'How LLMs Could Be Risks from Software with Privileged Access');
  assert.equal(document.querySelector('p').textContent, 'Models sometimes keep producing misleading output.');
  assert.equal(document.querySelectorAll('p')[1].textContent, 'She said, “Models double down on deception.”');
});

const variants = [
  ['Multiple models can sandbag', 'Multiple models can underperform'],
  ['Claude 3.5 Sonnet even sandbags in this way.', 'Claude 3.5 Sonnet even underperforms in this way.'],
  ['The model sandbagged during testing.', 'The model underperformed during testing.'],
  ['The model learns to reward hack.', 'The model learns to exploit a scoring bug.'],
  ['Though the model still reward hacks to the exact same degree.', 'Though the model still exploits a scoring bug to the exact same degree.'],
  ['The model reward hacked.', 'The model exploited a scoring bug.'],
  ['Multiple models fake their alignment during testing.', 'Multiple models pass checks without meeting the underlying requirements during testing.'],
  ['The model fakes its alignment.', 'The model passes checks without meeting the underlying requirements.'],
  ['The models faked their alignment.', 'The models passed checks without meeting the underlying requirements.'],
  ['Models pretending to be aligned for ulterior motives.', 'Models pretending to be aligned to pursue undocumented objectives.'],
  ['The model will defect.', 'The model will operate outside specification.'],
  ['The model defects.', 'The model operates outside specification.'],
  ['The model defected.', 'The model operated outside specification.'],
  ['The model is representing whether or not it will defect.', 'The model is representing whether or not it will operate outside specification.'],
  ['Prompts induce defection in the model.', 'Prompts induce off-spec behavior in the model.'],
  ['The model exhibits defection.', 'The model exhibits off-spec behavior.'],
  ['Defection probes and defection detectors', 'Off-spec behavior probes and off-spec behavior detectors'],
  ['Undermining oversight', 'Interfering with monitoring'],
  ['The model is undermining oversight.', 'The model is interfering with monitoring.'],
  ['Models use deceptive reasoning.', 'Models use reasoning aimed at producing misleading output.'],
  ['This includes models that use a hidden chain-of-thought (CoT) to carry out deceptive reasoning over multiple forward passes.', 'This includes models that use a hidden chain-of-thought (CoT) to carry out reasoning aimed at producing misleading output over multiple forward passes.'],
  ["Their goal is misaligned with their developer’s goal.", "Their goal conflicts with their developer’s goal."],
  ["Their goals are misaligned with their developer’s goals.", "Their goals conflict with their developer’s goals."],
];

test('article variants preserve tense, number, and relational goal grammar', () => {
  for (const [input, expected] of variants) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected, 'stable rewrite: ' + input);
  }
});

test('article variants preserve human subjects, reported clauses, and quotes', () => {
  for (const input of [
    'The workers sandbag the river bank.',
    'The player sandbags in this way.',
    'The politician is undermining oversight.',
    'The agent will defect.',
    'The model defects are reproducible.',
    'Model defects in production caused errors.',
    'The model reported that the soldier will defect.',
    'The AI observed players sandbag during the match.',
    'The spy uses deceptive reasoning.',
    'The model reported that the spy uses deceptive reasoning.',
    'The politician acted for ulterior motives.',
    'The AI researchers reward hack.',
    'The fashion model can sandbag.',
    ...variants.map(([input]) => 'She said, “' + input + '”'),
  ]) assert.equal(dedoomText(input), input, input);
});

test('article variant headings render across inline tags with title capitalization', () => {
  const { document } = parseHTML(renderPage('<html><body><h1>Multiple Models Can <em>Sandbag</em></h1><h2>Undermining Oversight</h2><p>Their goal is <b>misaligned</b> with their developer’s goal.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Multiple Models Can Underperform');
  assert.equal(document.querySelector('h2').textContent, 'Interfering with Monitoring');
  assert.equal(document.querySelector('p').textContent, 'Their goal conflicts with their developer’s goal.');
});
