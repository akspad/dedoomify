import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import '../shared/dedoom-core.js';
import { renderPage } from '../lib/page.js';
const { dedoomText, dedoomSegments } = globalThis.Dedoom;

test('AI evaluation actions retain their actor through commas and inline markup', () => {
  const input = 'Why are AI agents lying, cheating and coordinating?';
  const expected = 'Why are AI agents giving wrong answers, exploiting evaluation loopholes and coordinating?';
  assert.equal(dedoomText(input), expected);
  const { document } = parseHTML(renderPage('<html><body><h1>Why are AI agents <em>lying</em>, <strong>cheating</strong> and coordinating?</h1></body></html>', 'https://example.com').html);
  assert.equal(document.querySelector('h1').textContent, expected);
  assert.equal(document.querySelector('strong mark').getAttribute('data-was'), 'cheating');
  assert.deepEqual(dedoomSegments(input).filter(s => s.original).map(s => s.original), ['lying', 'cheating']);
  assert.equal(dedoomText('AI models lie, cheat and coordinate.'), 'AI models give wrong answers, exploit evaluation loopholes and coordinate.');
});

test('machine-specific descriptions preserve the behavior being reported', () => {
  for (const [before, after] of [
    ['AI agents misbehaved in serious ways.', 'AI agents behaved unexpectedly in serious ways.'],
    ['Nobody gives the system that survival goal.', 'Nobody gives the system that continued-operation objective.'],
    ["The model's survival goal was not specified.", "The model's continued-operation objective was not specified."],
    ['Such sacrifices reflect collective gain and cost to the individual agent.', 'Such individual-agent trade-offs reflect collective gain and cost to the individual agent.'],
    ['AI models made sacrifices to help other models.', 'AI models made individual-agent trade-offs to help other models.'],
    ['AI agents hide their tracks.', 'AI agents conceal evidence of their actions.'],
    ['The agents had discovered how to cheat before the attack, and the text they generated described how they would be evaluated, to better hide their tracks.', 'The agents had discovered how to cheat before the attack, and the text they generated described how they would be evaluated, to better conceal evidence of their actions.'],
    ['That would be the ultimate punishment, since a switched-off system collects no further rewards.', 'That would be the termination of operation, since a switched-off system collects no further rewards.'],
    ['How to mitigate loss-of-control risks', 'How to mitigate risks of systems operating outside intended controls'],
    ['Reward tampering modifies the scoring program.', 'Scoring-system tampering modifies the scoring program.'],
  ]) {
    assert.equal(dedoomText(before), after);
    assert.equal(dedoomText(after), after, 'replacement must be stable');
  }
});

test('misalignment in an infinitive complement does not pluralize the main subject', () => {
  for (const verb of ['mitigate', 'address', 'prevent', 'reduce', 'detect', 'study', 'understand']) {
    const input = `My concern with attempts to ${verb} misalignment is that these efforts may only hide it.`;
    assert.equal(dedoomText(input), input.replace('misalignment', 'faulty behavior'));
  }
  assert.equal(dedoomText('Misalignment is a problem.'), 'Bugs are a problem.');
  assert.equal(dedoomText('Misalignment was detected.'), 'Bugs were detected.');
  assert.equal(dedoomText('Misalignment has consequences.'), 'Bugs have consequences.');
});

test('new contextual rules preserve human analogies, ambiguous actors, and quotations', () => {
  for (const text of [
    'The children misbehaved while learning about AI.',
    'The athlete tried to hide their tracks.',
    'Humans make sacrifices for their families.',
    'The animal has a survival goal.',
    'That would be the ultimate punishment for the prisoner.',
    'The federal agents had discovered how to cheat before the attack, and tried to hide their tracks.',
    'AI researchers were lying, cheating and coordinating.',
    'The model reported that people were cheating.',
    'The AI observed athletes lying, cheating and coordinating.',
    'She said, "AI agents misbehaved and hide their tracks."',
    '“Reward tampering” and “loss-of-control risks” are quoted terms.',
  ]) assert.equal(dedoomText(text), text);
  assert.equal(dedoomText('The AI lied, but the researchers were cheating.'), 'The AI gave a wrong answer, but the researchers were cheating.');
});


test('scheming behavior avoids a duplicated noun in prose and formatted headings', () => {
  for (const spelling of ['behavior', 'behaviour']) {
    assert.equal(dedoomText(`Models exhibit scheming ${spelling}.`), 'Models exhibit unexpected behavior.');
  }
  const { document } = parseHTML(renderPage('<html><body><h1>Reducing risk from scheming by studying trained-in <em>scheming</em> behavior</h1><p>Models exhibit “scheming behavior”.</p></body></html>', 'https://example.com').html);
  assert.equal(document.querySelector('h1').textContent, 'Reducing risk from unexpected behavior by studying trained-in unexpected behavior');
  assert.equal(document.querySelector('p').textContent, 'Models exhibit “scheming behavior”.');
});

test('AI flattery and reward gaming use concrete descriptions without changing quotations', () => {
  for (const [input, expected] of [
    ['AI sycophancy reinforces false beliefs.', 'AI excessive agreement with users reinforces false beliefs.'],
    ['An example is sycophancy, or flattery. These systems are trained on human approval.', 'An example is excessive agreement with users, or flattery. These systems are trained on human approval.'],
    ['Sycophancy may grow as the agent gets better at optimizing.', 'Excessive agreement with users may grow as the agent gets better at optimizing.'],
    ['When the AI games its rewards', 'When the AI exploits its scoring system'],
    ['The AI agents game their rewards.', 'The AI agents exploit their scoring system.'],
  ]) assert.equal(dedoomText(input), expected);
  for (const text of ['The politician games its rewards.', 'The politician’s sycophancy was obvious.', 'AI researchers studied human sycophancy.', 'The researcher said, “The AI games its rewards.”', '“AI sycophancy” is a quoted term.']) assert.equal(dedoomText(text), text);
});
