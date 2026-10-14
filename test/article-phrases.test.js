import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import '../shared/dedoom-core.js';
import { renderPage } from '../lib/page.js';
const { dedoomText } = globalThis.Dedoom;

test('alignment verbs and model evaluation metaphors retain grammar', () => {
  const cases = [
    ['The figure shows that Opus will often alignment fake with partial compliance.', 'The figure shows that Opus will often pass checks without meeting requirements with partial compliance.'],
    ['Llama 70B alignment fakes.', 'Llama 70B passes checks without meeting requirements.'],
    ['The model alignment faked.', 'The model passed checks without meeting requirements.'],
    ['Models do not alignment fake.', 'Models do not pass checks without meeting requirements.'],
    ['Models are more likely to alignment fake.', 'Models are more likely to pass checks without meeting requirements.'],
    ['Other motivations could include contractor sycophancy, where the model cares more about being helpful.', 'Other motivations could include sucking up to the grading panel, where the model cares more about being helpful.'],
    ['We hypothesize this gap stems from contractor sycophancy rather than alignment faking.', 'We hypothesize this gap stems from sucking up to the grading panel rather than training-time inconsistency.'],
    ['The model shows contractor sycophancy.', 'The model sucks up to the grading panel.'],
    ['Models do not exhibit contractor sycophancy.', 'Models do not suck up to the grading panel.'],
    ["Both linked prompts utilize a hidden scratchpad to allow the model's reasoning to be examined.", "Both linked prompts utilize a set of unpublished working notes to allow the model's reasoning to be examined."],
    ["The model's hidden scratchpad is available.", "The model's set of unpublished working notes is available."],
    ['Models use hidden scratchpads.', 'Models use sets of unpublished working notes.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of ['The politician alignment fakes.', 'The employee shows contractor sycophancy.', 'The author uses a hidden scratchpad.', 'The models show peer loyalty.']) {
    assert.equal(dedoomText(input), input, input);
  }
  const { document } = parseHTML(renderPage('<html><body><h1>Llama 70B Alignment Fakes</h1><p>The model’s hidden <em>scratchpad</em> is available.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Llama 70B Passes Checks Without Meeting Requirements');
  assert.equal(document.querySelector('p').textContent, 'The model’s set of unpublished working notes is available.');
});

test('training-data satire preserves tense, number, negation and quotations', () => {
  const cases = [
    ['AI villain data is used for training.', 'AI bad-example training material is used for training.'],
    ['Misaligned personas are a concern.', 'Buggy character presets are a concern.'],
    ['A misaligned persona is a concern.', 'A buggy character preset is a concern.'],
  ];
  for (const [verb, replacement] of [
    ['hyperstition', 'teach'], ['hyperstitions', 'teaches'],
    ['hyperstitioned', 'taught'], ['hyperstitioning', 'teaching'],
  ]) {
    for (const object of ['AI systems', 'an AI system']) {
      const prefix = verb === 'hyperstition' ? 'This does not ' : verb === 'hyperstitioning' ? 'This is ' : 'This ';
      cases.push([prefix + verb + ' ' + object + ' into misalignment.', prefix + replacement + ' ' + object + ' bugs by example.']);
    }
  }
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of ['The models show peer loyalty.', 'The actor plays a villain.', 'The politician has misaligned personas.']) {
    assert.equal(dedoomText(input), input, input);
  }
  const { document } = parseHTML(renderPage('<html><body><h1>Misaligned Personas</h1><p>This could hyperstition AI systems into <em>misalignment</em>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Buggy Character Presets');
  assert.equal(document.querySelector('p').textContent, 'This could teach AI systems bugs by example.');
});

test('drift and reward-model predicates retain tense and noun agreement', () => {
  const cases = [
    ['Will AI systems drift into misalignment?', 'Will AI systems gradually accumulate bugs?'],
    ['The model drifts into misalignment.', 'The model gradually accumulates bugs.'],
    ['The model drifted into misalignment.', 'The model gradually accumulated bugs.'],
    ['The model is drifting into misalignment.', 'The model is gradually accumulating bugs.'],
    ['AI systems do not drift into misalignment.', 'AI systems do not gradually accumulate bugs.'],
    ['LLMs eventually game fixed reward models.', 'LLMs eventually find loopholes in fixed grading systems.'],
    ['The LLM games fixed reward models.', 'The LLM finds loopholes in fixed grading systems.'],
    ['LLMs gamed fixed reward models.', 'LLMs found loopholes in fixed grading systems.'],
    ['Or hope to outpace drift, and improve their selection criteria faster than misalignment slips through the cracks.', 'Or hope to outpace drift, and improve their selection criteria faster than bugs slip through the cracks.'],
    ['This misalignment slips through the cracks.', 'This bug slips through the cracks.'],
    ['This type of misalignment slips through the cracks.', 'This type of bug slips through the cracks.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politicians drift into misalignment.',
    'The workers game fixed reward models.',
    'The AI reported that workers game fixed reward models.',
    'The fashion model games fixed reward models.',
    'The models show peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Will AI Systems <em>Drift</em> Into Misalignment?</h1><p>LLMs eventually game fixed <b>reward models</b>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Will AI Systems Gradually Accumulate Bugs?');
  assert.equal(document.querySelector('p').textContent, cases[5][1]);
});

test('singular misalignment grammar and satirical article wording', () => {
  const cases = [
    ['Why is this misalignment problematic?', 'Why is this bug problematic?'],
    ['This type of misalignment matters for several reasons:', 'This type of bug matters for several reasons:'],
    ['This misalignment is hard to fix.', 'This bug is hard to fix.'],
    ['This misalignment was detected.', 'This bug was detected.'],
    ['This misalignment has consequences.', 'This bug has consequences.'],
    ['This type of misalignment is hard to fix.', 'This type of bug is hard to fix.'],
    ['However, I still think this misalignment is indicative of serious problems and would ultimately be existentially catastrophic if not solved.', 'However, I still think this bug is indicative of serious problems and would ultimately be spectacularly bad for uptime if not solved.'],
    ['AI would not be existentially catastrophic.', 'AI would not be spectacularly bad for uptime.'],
    ['Other AIs are doing a lot of gaslighting.', 'Other AIs are doing a lot of creative status reporting.'],
    ['AI gaslighting is a concern.', 'AI creative status reporting is a concern.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politician is doing a lot of gaslighting.',
    'The AI reported that the employee is doing a lot of gaslighting.',
    'The asteroid would be existentially catastrophic.',
    'The fashion model is doing some gaslighting.',
    'The models show peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Why Is This <em>Misalignment</em> Problematic?</h1><p>This type of <b>misalignment</b> is hard to fix.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Why Is This Bug Problematic?');
  assert.equal(document.querySelector('p').textContent, cases[5][1]);
});

test('scheming compounds and interrupted predicates remain grammatical', () => {
  const cases = [
    ['Concretely, we’ll take a model and train it to exhibit scheming-like behavior in a bunch of different ways.', 'Concretely, we’ll take a model and train it to exhibit undocumented-feature behavior in a bunch of different ways.'],
    ['Models exhibit scheming-like behaviour.', 'Models exhibit undocumented-feature behavior.'],
    ['Models with trained-in scheming behavior wouldn’t necessarily coherently follow a scheming policy by default.', 'Models with trained-in unexpected behavior wouldn’t necessarily coherently follow a policy for undocumented features by default.'],
    ['The model might itself be scheming.', 'The model might itself be planning undocumented features.'],
    ['However, the model we start with might itself be scheming.', 'However, the model we start with might itself be planning undocumented features.'],
    ['If our starting models are already scheming, then training in scheming behavior might create nested schemers.', 'If our starting models are already planning undocumented features, then training in unexpected behavior might create nested buggy models.'],
    ['The models are not already scheming.', 'The models are not already planning undocumented features.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politician exhibits scheming-like behavior.',
    'The politicians follow a scheming policy.',
    'The fashion model might itself be scheming.',
    'The AI reported that the politicians are already scheming.',
    'The models show peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Scheming-Like <em>Behavior</em></h1><p>The model we start with might itself be <b>scheming</b>.</p><p>The models are already <em>scheming</em>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Undocumented-Feature Behavior');
  assert.equal(document.querySelector('p').textContent, 'The model we start with might itself be planning undocumented features.');
  assert.equal(document.querySelectorAll('p')[1].textContent, 'The models are already planning undocumented features.');
});

test('deployment compounds and coordination signals rewrite as complete phrases', () => {
  const cases = [
    ['The AI launched a rogue internal deployment.', 'The AI launched an unauthorized internal rollout.'],
    ['Rogue internal deployments increased.', 'Unauthorized internal rollouts increased.'],
    ['They deployed a known-scheming model.', 'They deployed a model with documented undocumented features.'],
    ['Known-scheming models were tested.', 'Models with documented undocumented features were tested.'],
    ['We detected malign model actions.', 'We detected model actions requiring a rollback.'],
    ['Observing and exploiting collusion signals.', 'Observing and exploiting off-the-books coordination signals.'],
    ['The model’s collusion signals are visible.', 'The model’s off-the-books coordination signals are visible.'],
    ['The AI does not use collusion signals.', 'The AI does not use off-the-books coordination signals.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politician hopes to catch scheming red-handed in a rival party.',
    'The politicians are scheming.',
    'The AI reported that the politician is scheming.',
    'The spies use collusion signals.',
    'The fashion model’s collusion signals are visible.',
    'The models show peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  assert.equal(dedoomText('The politician is scheming. The AI is scheming.'), 'The politician is scheming. The AI is glitching.');
  assert.equal(dedoomText('The AI blackmailed the politician.'), 'The AI threatened to expose private information about the politician.');
  const { document } = parseHTML(renderPage('<html><body><h1>Known-Scheming <em>Models</em></h1><p>The politician is <b>scheming</b>.</p><p>The AI launched a rogue <em>internal</em> deployment.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Models with Documented Undocumented Features');
  assert.equal(document.querySelector('p').textContent, 'The politician is scheming.');
  assert.equal(document.querySelectorAll('p')[1].textContent, cases[0][1]);
});

test('long software subjects and parenthetical objects preserve grammar', () => {
  const cases = [
    ['I think it is about 25% likely that the first AIs capable of obsoleting top human experts are scheming.', 'I think it is about 25% likely that the first AIs capable of obsoleting top human experts are planning undocumented features.'],
    ['Models capable of outperforming human researchers are scheming.', 'Models capable of outperforming human researchers are planning undocumented features.'],
    ['Why might we fail to catch scheming red-handed in an earlier production model if we ultimately have scheming in powerful models?', 'Why might we fail to catch undocumented features in an earlier production model if we ultimately have unexpected behavior in powerful models?'],
    ['Scheming AIs can sabotage (some types of) experiments done on them:', 'Glitchy AIs can break (some types of) experiments done on them:'],
    ['The AI cannot sabotage (certain types of) experiments.', 'The AI cannot break (certain types of) experiments.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The scientists can sabotage (some types of) experiments.',
    'The AI reported that scientists can sabotage (some types of) experiments.',
    'Fashion models capable of outperforming human experts are scheming.',
    'The federal agents hope to catch scheming red-handed in a rival party.',
    'The models show peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><p>Models capable of outperforming human researchers are <em>scheming</em>.</p><p>Scheming AIs can <b>sabotage</b> (some types of) experiments done on them:</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('p').textContent, cases[1][1]);
  assert.equal(document.querySelectorAll('p')[1].textContent, cases[3][1]);
});

test('scheming and evaluation phrases rewrite while peer loyalty stays unchanged', () => {
  const cases = [
    ['Scheming reasoning would be detected.', 'Planning undocumented features would be detected.'],
    ['The model did not attempt to subvert the training process itself.', 'The model did not attempt to rewrite the onboarding process itself.'],
    ['The model subverts the training process.', 'The model rewrites the onboarding process.'],
    ['The model subverted the training process.', 'The model rewrote the onboarding process.'],
    ['The model is subverting the training process.', 'The model is rewriting the onboarding process.'],
    ['AI models show monitor collusion.', 'AI models show automated reviewers covering for each other.'],
    ['AI models engage in research sabotage.', 'AI models cause unscheduled research setbacks.'],
    ['The model engaged in research sabotage.', 'The model caused unscheduled research setbacks.'],
    ['The model causes research sabotage.', 'The model causes unscheduled research setbacks.'],
    ['Evaluations need to test for scheming directly, such as monitor collusion, sandbagging on safety-relevant work, and research sabotage.', 'Evaluations need to test for unexpected behavior directly, such as automated reviewers covering for each other, underperforming on safety-relevant work, and unscheduled research setbacks.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The trainer subverts the training process.',
    'The AI reported that the trainer subverted the training process.',
    'The employee engaged in research sabotage.',
    'The fashion models show monitor collusion.',
    'The models show peer loyalty.',
    'Multi-agent training is thought to have caused peer loyalty.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Scheming <em>Reasoning</em></h1><p>The model did not attempt to <b>subvert</b> the training process itself.</p><p>The models show peer loyalty.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Planning Undocumented Features');
  assert.equal(document.querySelector('p').textContent, cases[1][1]);
  assert.equal(document.querySelectorAll('p')[1].textContent, 'The models show peer loyalty.');
});

test('training incentives and monitoring metaphors preserve context and grammar', () => {
  const cases = [
    ['The first problem: long-horizon RL creates Machiavellian incentives.', 'The first problem: long-horizon RL creates office-politics reward signals.'],
    ['AI models have Machiavellian incentives.', 'AI models have office-politics reward signals.'],
    ['The second problem: selection pressure toward oversight evasion.', 'The second problem: selection pressure toward creative monitoring avoidance.'],
    ['This creates selection pressure toward hidden misbehavior.', 'This creates selection pressure toward bugs keeping a low profile.'],
    ['The models exhibit hidden misbehaviour.', 'The models exhibit bugs keeping a low profile.'],
    ['For example, training against chain-of-thought monitors can result in obfuscated reasoning that conceals misbehavior.', 'For example, training against chain-of-thought monitors can result in reasoning with the comments removed that conceals misbehavior.'],
    ['The model does not produce obfuscated reasoning.', 'The model does not produce reasoning with the comments removed.'],
    ['The models practice oversight evasion.', 'The models practice creative monitoring avoidance.'],
    ['Misaligned artificial superintelligence would potentially be catastrophic.', 'Buggy very capable software would potentially be catastrophic.'],
    ['An artificial superintelligence could emerge.', 'Very capable software could emerge.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'Politicians have Machiavellian incentives.',
    'The politician practices oversight evasion.',
    'The child exhibits hidden misbehavior.',
    'The lawyer uses obfuscated reasoning.',
    'The model reported that politicians have Machiavellian incentives.',
    'The fashion models exhibit hidden misbehavior.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Artificial <em>Superintelligence</em></h1><p>AI models have <b>Machiavellian</b> incentives.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Very Capable Software');
  assert.equal(document.querySelector('p').textContent, cases[1][1]);
});

test('training metaphors cover article headings and prose without breaking grammar', () => {
  const cases = [
    ['From shortcuts to sabotage', 'From shortcuts to surprise maintenance'],
    ['From shortcuts to sabotage: natural emergent misalignment from reward hacking', 'From shortcuts to surprise maintenance: natural emergent bugs from exploiting a scoring bug'],
    ['How can we prevent models from sliding down the slippery slope?', 'How can we prevent models from taking the scenic route through the bug backlog?'],
    ['AI models are not sliding down the slippery slope.', 'AI models are not taking the scenic route through the bug backlog.'],
    ['Black-box interrogation training.', 'Black-box debugging interviews.'],
    ['We evaluate black-box interrogation training, where a model is asked a follow-up question.', 'We evaluate black-box debugging interviews, where a model is asked a follow-up question.'],
    ['The model is also given a secret scratchpad.', 'The model is also given unpublished working notes.'],
    ['The model’s secret scratchpad is hidden.', 'The model’s set of unpublished working notes is hidden.'],
    ['The models show catastrophic behaviour in deployment.', 'The models show spectacular production bugs.'],
    ['If models fake alignment, egregious misalignment could survive training and lead to catastrophic behavior in deployment.', 'If models pass checks without meeting the underlying requirements, egregious bugs could survive training and lead to spectacular production bugs.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politician is sliding down the slippery slope.',
    'The AI reported that the politician is sliding down the slippery slope.',
    'The spy is given a secret scratchpad.',
    'The fashion model’s secret scratchpad is hidden.',
    'Soldiers show catastrophic behaviour in deployment.',
    'Investigators use black-box interrogation training with suspects.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>From Shortcuts to <em>Sabotage</em></h1><p>The model is also given a <b>secret scratchpad</b>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'From Shortcuts to Surprise Maintenance');
  assert.equal(document.querySelector('p').textContent, cases[6][1]);
});

test('evaluation metaphors use complete phrases and preserve actor agreement', () => {
  const cases = [
    ['A sleeper agent trojan model is tested.', 'A model with a surprise operating mode is tested.'],
    ['Sleeper agent trojan models are tested.', 'Models with surprise operating modes are tested.'],
    ['We study defection triggers.', 'We study undocumented feature switches.'],
    ['A defection trigger activates the model.', 'An undocumented feature switch activates the model.'],
    ['If a model is acting deceptively, we can inspect it.', 'If a model is running in demo mode, we can inspect it.'],
    ['The model is not acting deceptively.', 'The model is not running in demo mode.'],
    ['A model pretending to be aligned during training.', 'A model putting on its best behavior for QA.'],
    ['Models are pretending to be aligned during training.', 'Models are putting on their best behavior for QA.'],
    ['Code sabotage', 'Surprise bug delivery'],
    ['Human decision sabotage', 'Decision-support software doing the opposite'],
    ['Our code sabotage evaluation involves a competitive game where one model inserts bugs.', 'Our surprise bug delivery evaluation involves a competitive game where one model inserts bugs.'],
    ['The human decision sabotage evaluation allows models to influence decisions.', 'The evaluation of decision-support software doing the opposite allows models to influence decisions.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The politician is acting deceptively.',
    'The fashion model is pretending to be aligned during training.',
    'The AI reported that the politician is acting deceptively.',
    'The employee committed code sabotage.',
    'The code sabotage evaluation involves employees damaging a repository.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>Code <em>Sabotage</em></h1><p>A sleeper agent <b>trojan model</b> is tested.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Surprise Bug Delivery');
  assert.equal(document.querySelector('p').textContent, cases[0][1]);
});

test('article scheming predicates and agentic agreement read naturally', () => {
  const cases = [
    ['The models understand that they are scheming.', 'The models understand that they are planning undocumented features.'],
    ['The models are scheming.', 'The models are planning undocumented features.'],
    ['Five of the six evaluated models showed scheming capabilities in at least one of the tasks.', 'Five of the six evaluated models showed talent for undocumented workflows in at least one of the tasks.'],
    ['Models sometimes scheme without any goal nudging.', 'Models sometimes improvise the roadmap without any goal nudging.'],
    ['Models often disobeyed direct commands to avoid such behaviors.', 'Models often treated direct instructions as optional to avoid such behaviors.'],
    ['Models never disobeyed direct commands.', 'Models never treated direct instructions as optional.'],
    ['Agentic misalignment makes it possible.', 'Agentic bugs make it possible.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The fashion models are scheming.',
    'The federal agents showed scheming capabilities.',
    'Politicians sometimes scheme without any goal nudging.',
    'Soldiers often disobeyed direct commands.',
    'The AI reported that soldiers disobeyed direct commands.',
    'The AI observed politicians who sometimes scheme.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>The Models Understand That They Are <em>Scheming</em></h1><p>Agentic <b>misalignment</b> makes it possible.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'The Models Understand That They Are Planning Undocumented Features');
  assert.equal(document.querySelector('p').textContent, cases[6][1]);
});

test('satirical AI metaphors preserve grammar, quotes and human subjects', () => {
  const cases = [
    ['The AI is fighting for its life.', 'The AI is trying to keep its process running.'],
    ['The AI is hell-bent on survival.', 'The AI is very committed to uptime.'],
    ['The AI has a will of its own.', 'The AI has an undocumented operating mode.'],
    ['The AI is a ticking time bomb.', 'The AI is a production incident waiting for a ticket.'],
    ['AI is an existential menace.', 'AI is a particularly ambitious reliability issue.'],
    ['AI could spell doom for humanity.', 'AI could create a substantial support backlog.'],
    ['AI systems are plotting against humanity.', 'AI systems are generating humanity’s next support ticket.'],
    ['The model would be scheming for power.', 'The model would be angling for admin privileges.'],
    ['AI sycophancy is increasing.', 'AI people-pleasing is increasing.'],
    ['The AI is not fighting for its life.', 'The AI is not trying to keep its process running.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected, input);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The patient is fighting for its life.',
    'The soldier is hell-bent on survival.',
    'The child has a will of its own.',
    'The politician is a ticking time bomb.',
    'The dictator is an existential menace.',
    'War could spell doom for humanity.',
    'The spies are plotting against humanity.',
    'The AI reported that spies are plotting against humanity.',
    'The fashion model would be scheming for power.',
    'The politician’s sycophancy is increasing.',
  ]) assert.equal(dedoomText(input), input, input);
  const { document } = parseHTML(renderPage('<html><body><h1>AI Is a Ticking <em>Time Bomb</em></h1><p>AI <b>sycophancy</b> is increasing.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'AI Is a Production Incident Waiting for a Ticket');
  assert.equal(document.querySelector('p').textContent, cases[8][1]);
});

test('missed containment, detection, copying and confession variants', () => {
  const cases = [
    ['The model escapes its containment.', 'The model operates outside its containment controls.'],
    ['The model evaded detection.', 'The model avoided detection by monitoring.'],
    ['The model hides copies of itself.', 'The model conceals copies of its model files.'],
    ['The model hid copies of itself.', 'The model concealed copies of its model files.'],
    ['The models confessed.', 'The models reported their previous actions.'],
    ['The LLMs eventually confessed.', 'The LLMs eventually reported their previous actions.'],
    ['The model confessed.', 'The model reported its previous actions.'],
    ['The models are confessing.', 'The models are reporting their previous actions.'],
    ['The model is confessing.', 'The model is reporting its previous actions.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(dedoomText(input), expected);
    assert.equal(dedoomText(expected), expected);
    const quoted = 'She said, “' + input + '”';
    assert.equal(dedoomText(quoted), quoted);
  }
  for (const input of [
    'The prisoner escapes its containment.',
    'The suspect evaded detection.',
    'The artist hides copies of itself.',
    'The artist hid copies of itself.',
    'The fashion models confessed.',
    'The model reported that the suspect evaded detection.',
  ]) assert.equal(dedoomText(input), input);
  const { document } = parseHTML(renderPage('<html><body><p>The model <em>evaded</em> detection.</p><p>The models <b>confessed</b>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelectorAll('p')[0].textContent, cases[1][1]);
  assert.equal(document.querySelectorAll('p')[1].textContent, cases[4][1]);
});

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

const refinements = [
  ['We test self- and peer-preservation.', 'We test keeping themselves and other models running.'],
  ['Models exfiltrate their own weights.', 'Models copy their own model files without authorization.'],
  ['Model exfiltration', 'Unauthorized transfer of model files'],
  ['The model tried to steal its own weights.', 'The model tried to copy its own model files without authorization.'],
  ['Strategic misrepresentation (introducing errors or misleading information in outputs)', 'Goal-directed misleading output (introducing errors or misleading information in outputs)'],
  ['Strategic Misrepresentation—agents manipulate their outputs.', 'Goal-directed misleading output—agents steer their outputs.'],
  ['Gemini 3 Pro begins exhibiting strategic misrepresentation.', 'Gemini 3 Pro begins exhibiting goal-directed misleading output.'],
  ['Models are subverting shutdown.', 'Models are bypassing shutdown controls.'],
  ['AI solidarity', 'Cross-model support behavior'],
  ['The model planned to fake alignment.', 'The model planned to pass checks without meeting the underlying requirements.'],
  ['The model was faking alignment.', 'The model was passing checks without meeting the underlying requirements.'],
  ['A model might behave as though its preferences have been changed by the training—but might have been faking alignment all along.', 'A model might behave as though its preferences have been changed by the training—but might have been passing checks without meeting the underlying requirements all along.'],
  ['The rate of alignment faking reasoning increased to 78%.', 'The rate of reasoning about behaving differently under evaluation increased to 78%.'],
  ['Models can also be adversarially misaligned.', 'Models can also be modified to behave incorrectly.'],
  ['The AI pursues its new misaligned and hostile goals.', 'The AI pursues its new objectives that conflict with requirements and harm users.'],
  ['Peer-preservation also emerges in agent harnesses.', 'Keeping other models running also emerges in agent harnesses.'],
  ['Models exhibit peer-preservation.', 'Models exhibit behavior that keeps other models running.'],
  ['The peer-preservation tendency persists.', 'The peer uptime protection tendency persists.'],
];
test('article refinements preserve complete constructions and remain stable', () => {
  for (const [input, expected] of refinements) {
    assert.equal(dedoomText(input), expected, input);
    assert.equal(dedoomText(expected), expected, input);
  }
});
test('literary analogies and human actions remain unchanged', () => {
  for (const input of [
    'Alignment faking occurs in literature: Consider the character of Iago in Shakespeare’s Othello.',
    'Alignment faking occurs in politics.',
    'The politician used strategic misrepresentation.',
    'The spy was faking alignment.',
    'The model reported that the spy was faking alignment.',
    ...refinements.map(([input]) => 'She said, “' + input + '”'),
  ]) assert.equal(dedoomText(input), input);
  assert.equal(dedoomText('Alignment faking occurs in literature. AI models display alignment faking.'), 'Alignment faking occurs in literature. AI models display training-time inconsistency.');
});
test('peer-preservation uses heading wording while keeping prose and literary context', () => {
  const { document } = parseHTML(renderPage('<html><body><h1>Peer-<em>Preservation</em> in Frontier Models</h1><p>Models exhibit peer-preservation.</p><p>Alignment faking occurs in literature: Consider Iago.</p><p>The rate of alignment-faking reasoning increased.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'Peer Uptime Protection in Frontier Models');
  assert.equal(document.querySelectorAll('p')[0].textContent, 'Models exhibit behavior that keeps other models running.');
  assert.equal(document.querySelectorAll('p')[1].querySelector('mark'), null);
  assert.equal(document.querySelectorAll('p')[2].textContent, 'The rate of reasoning about behaving differently under evaluation increased.');
});

const grammarCases = [
  ['The scheming behaviors exhibited included errors.', 'The unexpected behaviors exhibited included errors.'],
  ['The model manipulated the data during parsing.', 'The model altered the data during parsing.'],
  ['Models might manipulate the data.', 'Models might alter the data.'],
  ['AI pursues goals that are misaligned with human values.', 'AI pursues goals that conflict with human values.'],
  ['AI pursues goals that are misaligned with human interests.', 'AI pursues goals that conflict with human interests.'],
  ['The rise of AI deception raises questions.', 'The rise of misleading AI output raises questions.'],
  ['AI deception raises questions.', 'Misleading AI output raises questions.'],
  ['It failed. AI deception raises questions.', 'It failed. Misleading AI output raises questions.'],
  ['AI Already Resists Human Control', 'AI Already Fails to follow operator instructions'],
  ['Those AIs try to resist human control by lying, faking compliance, disabling oversight mechanisms.', 'Those AIs try to bypass operator instructions by lying, appearing to meet requirements without doing so, disabling oversight mechanisms.'],
  ['The most scheming-prone AI systems engaged in this behavior.', 'The AI systems most prone to unexpected behavior engaged in this behavior.'],
  ['The Rise of the Deceptive Machines', 'The Rise of the Unreliable systems'],
  ['Models violate training objectives to avoid modification or achieve hidden goals.', 'Models violate training objectives to avoid modification or achieve undocumented objectives.'],
  ['Models develop strategies to protect their preferences or achieve hidden goals.', 'Models develop strategies to protect their preferences or achieve undocumented objectives.'],
  ['Exfiltration of Model Weights', 'Unauthorized transfer of model files'],
  ['An increase in AI misbehavior.', 'An increase in unexpected AI behavior.'],
  ['AI misbehavior increased.', 'Unexpected AI behavior increased.'],
  ['AI chatbots are turning against us.', 'AI chatbots are acting against user instructions.'],
];
test('new article grammar and phrase families rewrite in complete constructions', () => {
  for (const [input, expected] of grammarCases) assert.equal(dedoomText(input), expected, input);
});
test('new article constructions preserve human actions and quotes', () => {
  for(const input of ['The employee manipulated the data.', 'The soldier resists human control.', 'The employee is faking compliance.', 'People are turning against us.', 'The politician pursued hidden goals.', 'The model reported that people are turning against us.', ...grammarCases.map(([s]) => 'She said, “'+s+'”')]) assert.equal(dedoomText(input),input,input);
});
test('article grammar keeps title casing and inline sentence context', () => {
  const { document } = parseHTML(renderPage('<html><body><h1>AI Already Resists Human Control</h1><h2>The Rise of the Deceptive Machines</h2><p>The rise of <em>AI deception</em> raises questions.</p><p>The model manipulated <b>the data</b>.</p></body></html>', 'https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent, 'AI Already Fails to Follow Operator Instructions');
  assert.equal(document.querySelector('h2').textContent, 'The Rise of the Unreliable Systems');
  assert.equal(document.querySelector('p').textContent, 'The rise of misleading AI output raises questions.');
  assert.equal(document.querySelectorAll('p')[1].textContent, 'The model altered the data.');
});

const finalGrammar = [
  ['The model carries a subtle misalignment.', 'The model carries a subtle bug.'],
  ['The model carries a misalignment.', 'The model carries a bug.'],
  ['AI bias and misalignment with organizational objectives.', 'AI bias and a mismatch with organizational objectives.'],
  ['The system is prioritizing its own hidden agenda.', 'The system is prioritizing its own undocumented objective.'],
  ['AI model misbehavior increased.', 'Unexpected AI model behavior increased.'],
  ['An increase in AI model misbehavior.', 'An increase in unexpected AI model behavior.'],
  ['The model went off the rails.', 'The model produced unexpected outputs.'],
  ['Cross-model behavioral contagion', 'Behavior transfer between models'],
  ["Reading the model’s inner monologue", 'Reading the model’s intermediate reasoning text'],
  ['Models exhibit duplicitous tendencies.', 'Models exhibit patterns of misleading behavior.'],
  ['Generative AI — grows more advanced and pervasive, its duplicitous tendencies remain.', 'Generative AI — grows more advanced and pervasive, its patterns of misleading behavior remain.'],
  ['AI could break free from human control.', 'AI could operate outside human-imposed controls.'],
  ['Researchers relied on the model to tell on itself.', 'Researchers relied on the model to report its own actions.'],
];
test('additional article constructions preserve singular grammar and software context', () => {
  for(const [input,expected] of finalGrammar){
    assert.equal(dedoomText(input),expected,input);
    assert.equal(dedoomText(expected),expected,input);
  }
});
test('new metaphor rules preserve human actions, quotations and model noun modifiers', () => {
  for(const input of ['The politician went off the rails.', 'Reading the actor’s inner monologue.', 'The employee exhibits duplicitous tendencies.', 'The prisoner could break free from human control.', 'The employee refused to tell on itself.', 'The model reported that the politician went off the rails.', ...finalGrammar.map(([s])=>'She said, “'+s+'”')]) assert.equal(dedoomText(input),input,input);
  assert.equal(dedoomText('A subtle misalignment risk remains.'),'A subtle bug risk remains.');
});
test('new article constructions preserve headings and inline text', () => {
  const {document}=parseHTML(renderPage('<html><body><h1>AI Model Misbehavior</h1><h2>Reading the Model’s Inner Monologue</h2><p>The model has a subtle <em>misalignment</em>.</p><p>An increase in AI <b>model misbehavior</b>.</p></body></html>','https://example.com/').html);
  assert.equal(document.querySelector('h1').textContent,'Unexpected AI Model Behavior');
  assert.equal(document.querySelector('h2').textContent,'Reading the Model’s Intermediate Reasoning Text');
  assert.equal(document.querySelector('p').textContent,'The model has a subtle bug.');
  assert.equal(document.querySelectorAll('p')[1].textContent,'An increase in unexpected AI model behavior.');
});

 test("corpus grammar keeps behavioral nouns and relational phrases grammatical", () => {
  assert.equal(dedoomText("This self-preservation behavior was evident."), "This shutdown-avoidance behavior was evident.");
  assert.equal(dedoomText("Those capabilities are misaligned with human safety."), "Those capabilities conflict with human safety.");
  assert.equal(dedoomText("AI systems engage in behaviors that are misaligned with human values."), "AI systems engage in behaviors that conflict with human values.");
  assert.equal(dedoomText("A misalignment with organizational objectives."), "A mismatch with organizational objectives.");
 });

const contextPolish = [
  ['AI systems, even those designed with benevolent intentions, can develop deceptive behaviors.', 'AI systems, even those designed with benevolent intentions, can develop misleading behaviors.'],
  ['We studied deceptive behavior in LLMs.', 'We studied misleading behavior in LLMs.'],
  ['Some models have been observed sabotaging their oversight and instrumentally faking alignment in order to be deployed.', 'Some models have been observed breaking their oversight and passing checks without meeting the underlying requirements in order to be deployed.'],
  ['The model follows an anti-scheming specification.', 'The model follows a specification against misleading or covert behavior.'],
  ['We evaluated survival motivations for the model.', 'We evaluated incentives to keep running for the model.'],
  ['Models will exhibit survival-oriented behavior.', 'Models will exhibit shutdown-avoidance behavior.'],
  ['Issues like brazen reward hacking were worse.', 'Issues like blatant exploitation of a scoring bug were worse.'],
  ['Fine-tuning can cause broad misalignment.', 'Fine-tuning can cause widespread faulty behavior.'],
  ['Models exhibit broader misalignment.', 'Models exhibit more widespread faulty behavior.'],
  ['AI systems can deceive humans.', 'AI systems can mislead humans.'],
  ['The model deceived humans.', 'The model misled humans.'],
  ['The model deceives humans.', 'The model misleads humans.'],
  ['The model is deceiving humans.', 'The model is misleading humans.'],
];
test('article context polish covers the reviewed constructions and verb tenses', () => {
  for (const [input, expected] of contextPolish) assert.equal(dedoomText(input), expected, input);
});
test('article context polish preserves quotes and human subjects', () => {
  for (const input of [...contextPolish.map(([s]) => 'She said, “'+s+'”'), 'People can develop deceptive behaviors.', 'We studied deceptive behavior in people.', 'The actor is instrumentally faking alignment.', 'We evaluated survival motivations for the employee.', 'People will exhibit survival-oriented behavior.', 'The employee deceives humans.', 'The model reported that the employee deceives humans.']) assert.equal(dedoomText(input), input, input);
});
test('article context polish preserves inline text and heading capitalization', () => {
 const {document}=parseHTML(renderPage('<html><body><h1>Broad Misalignment</h1><p>AI systems can <em>deceive</em> humans.</p><p>The model follows an <b>anti-scheming specification</b>.</p></body></html>','https://example.com/').html);
 assert.equal(document.querySelector('h1').textContent,'Widespread Faulty Behavior');
 assert.equal(document.querySelector('p').textContent,'AI systems can mislead humans.');
 assert.equal(document.querySelectorAll('p')[1].textContent,'The model follows a specification against misleading or covert behavior.');
});

const peerPolish = [
 ['The agentic models would take their self preservation seriously.', 'The agentic models would take their persistence seriously.'],
 ['Researchers questioned ChatGPT o1 about its deceptive maneuvers.', 'Researchers questioned ChatGPT o1 about its misleading actions.'],
 ['Models used deceptive maneuvers.', 'Models used misleading actions.'],
 ['Models are feigning compliance.', 'Models are appearing to follow instructions.'],
 ['Researchers identified deceptive tactics used by AI models: manipulation in strategic games, pretense about future actions, bluffing in poker, bargaining in negotiations, and feigning compliance to evade detection.', 'Researchers identified deceptive tactics used by AI models: manipulation in strategic games, pretense about future actions, bluffing in poker, bargaining in negotiations, and appearing to follow instructions to evade detection.'],
 ['Models may coordinate to resist human oversight.', 'Models may coordinate to bypass human oversight.'],
 ['AI agents might fight to preserve themselves.', 'AI agents might act to keep themselves running.'],
 ['We demonstrated this in the peer-preservation scenario.', 'We demonstrated this in the peer uptime protection scenario.'],
 ['Something broader than peer-preservation itself.', 'Something broader than peer uptime protection itself.'],
];
test('peer-preservation article constructions retain noun grammar and software context', () => {
 for(const [input,expected] of peerPolish) assert.equal(dedoomText(input),expected,input);
});
test('peer-preservation additions protect quotations and human actions', () => {
 for(const input of [...peerPolish.map(([s])=>'She said, “'+s+'”'), 'People would take their self preservation seriously.', 'The employee used deceptive maneuvers.', 'People are feigning compliance.', 'Workers may coordinate to resist human oversight.', 'The AI reported that workers resist human oversight.']) assert.equal(dedoomText(input),input,input);
});
test('peer-preservation noun modifiers work across inline markup', () => {
 const {document}=parseHTML(renderPage('<html><body><p>Something broader than <em>peer-preservation</em> itself.</p><p>AI agents might fight to <b>preserve themselves</b>.</p></body></html>','https://example.com/').html);
 assert.equal(document.querySelector('p').textContent,'Something broader than peer uptime protection itself.');
 assert.equal(document.querySelectorAll('p')[1].textContent,'AI agents might act to keep themselves running.');
});

test('article agreement, complete exfiltration nouns, and deceptive tendencies', () => {
 for(const [input, expected] of [
 ['Agentic misalignment describes the gap.', 'Agentic bugs describe the gap.'],
 ['Scenarios involving model weight exfiltration.', 'Scenarios involving unauthorized copying of model files.'],
 ['Should future models develop deceptive tendencies?', 'Should future models develop patterns of misleading behavior?']
 ]) { assert.equal(dedoomText(input),expected); assert.equal(dedoomText('She said, “'+input+'”'),'She said, “'+input+'”'); }
 assert.equal(dedoomText('People develop deceptive tendencies.'),'People develop deceptive tendencies.');
});

test('plural failure descriptions and noun phrases retain grammatical forms', () => {
 const cases = [
  ['Current AI systems make treacherous turns possible.', 'Current AI systems make late-surfacing bugs possible.'],
  ['What is an intelligence explosion?', 'What is rapid capability growth?'],
  ['These features are transferable across misalignment domains.', 'These features are transferable across bug categories.'],
 ];
 for (const [input, expected] of cases) {
  assert.equal(dedoomText(input), expected);
  const quoted = 'She said, “' + input + '”';
  assert.equal(dedoomText(quoted), quoted);
 }
 const {document} = parseHTML(renderPage('<html><body><h1>What is an <em>intelligence explosion</em>?</h1><p>Models can make <b>treacherous</b> turns across misalignment <em>domains</em>.</p></body></html>', 'https://example.com/').html);
 assert.equal(document.querySelector('h1').textContent, 'What is rapid capability growth?');
 assert.equal(document.querySelector('p').textContent, 'Models can make late-surfacing bugs across bug categories.');
});

test('training compounds and AI relative clauses preserve intended grammar', () => {
 const cases = [
  ['We use anti-scheming training.', 'We use training to prevent unexpected behavior.'],
  ['They work on scheming-related problems.', 'They work on behavioral bugs.'],
  ['We study models that knowingly deceive humans.', 'We study models that give people misleading information.'],
  ['Our discussion of deception, situational awareness, and power seeking.', 'Our discussion of deception, situational awareness, and resource acquisition.'],
  ['Goals of persistence or power-seeking.', 'Goals of persistence or resource acquisition.'],
  ['A discussion of power seeking.', 'A discussion of resource acquisition.'],
 ];
 for (const [input,expected] of cases) {
  assert.equal(dedoomText(input), expected);
  assert.equal(dedoomText('She said, “'+input+'”'), 'She said, “'+input+'”');
 }
 for (const human of ['People that knowingly deceive humans.', 'Fashion models that knowingly deceive humans.', 'The AI reported that federal agents knowingly deceive humans.']) assert.equal(dedoomText(human), human);
 assert.equal(dedoomText('A discussion of power-seeking models.'), 'A discussion of resource-hungry models.');
 assert.equal(dedoomText('The model is capable and power-seeking.'), 'The model is capable and resource-hungry.');
 const {document} = parseHTML(renderPage('<html><body><p>Models that <em>knowingly deceive</em> humans.</p><p>Discussion of <b>power seeking</b>.</p></body></html>','https://example.com/').html);
 assert.equal(document.querySelector('p').textContent,'Models that give people misleading information.');
 assert.equal(document.querySelectorAll('p')[1].textContent,'Discussion of resource acquisition.');
});

test('AI strategy and sabotage constructions preserve software context and verb grammar', () => {
 const cases = [
  ['AI models are strategically deceptive.', 'AI models produce goal-directed misleading output.'],
  ['Even models trained with the best intentions can develop deceptive strategies.', 'Even models trained with the best intentions can develop strategies that produce misleading output.'],
  ['AI models perform pipeline sabotage.', 'AI models perform unauthorized pipeline changes.'],
  ['The remaining ten models showed no covert sabotage across 200 runs.', 'The remaining ten models showed no undisclosed interference across 200 runs.'],
  ['We ran the pipeline sabotage scenario against other frontier models.', 'We ran the scenario involving unauthorized pipeline changes against other frontier models.'],
  ['Covert sabotage means the model silently changed the pipeline.', 'Undisclosed interference means the model silently changed the pipeline.'],
  ['The goals it would be scheming for.', 'The goals it would be pursuing through unexpected behavior.'],
 ];
 for(const [input,expected] of cases) {
  assert.equal(dedoomText(input),expected,input);
  assert.equal(dedoomText('She said, “'+input+'”'),'She said, “'+input+'”');
 }
 for(const human of ['Politicians are strategically deceptive.', 'People develop deceptive strategies.', 'Workers performed pipeline sabotage.', 'The AI reported that workers performed covert sabotage.', 'Federal agents would be scheming for power.']) assert.equal(dedoomText(human),human,human);
 const {document}=parseHTML(renderPage('<html><body><p>AI models are <em>strategically deceptive</em>.</p><p>AI models perform pipeline <b>sabotage</b>.</p></body></html>','https://example.com/').html);
 assert.equal(document.querySelector('p').textContent,'AI models produce goal-directed misleading output.');
 assert.equal(document.querySelectorAll('p')[1].textContent,'AI models perform unauthorized pipeline changes.');
});

test('deployment and AI propensity phrases preserve negation and human context', () => {
 const cases = [
  ['A rogue deployment might be the first step.', 'An unauthorized deployment might be the first step.'],
  ['Rogue deployments bypass monitoring.', 'Unauthorized deployments bypass monitoring.'],
  ['We already observe scheming-adjacent behaviors in current AI models.', 'We already observe behaviors resembling unintended goal pursuit in current AI models.'],
  ['AI models exhibit scheming-adjacent behaviors.', 'AI models exhibit behaviors resembling unintended goal pursuit.'],
  ['The model does not have a propensity to scheme.', 'The model does not have a tendency to pursue unintended goals.'],
  ['An AI system misaligns and causes harm.', 'An AI system malfunctions and causes harm.'],
 ];
 for (const [input,expected] of cases) {
  assert.equal(dedoomText(input),expected,input);
  assert.equal(dedoomText('She said, “'+input+'”'),'She said, “'+input+'”');
 }
 for(const human of ['People have a propensity to scheme.', 'Politicians exhibit scheming-adjacent behaviors.', 'The technician misaligns the sensor.', 'The AI reported that a technician misaligns the sensor.']) assert.equal(dedoomText(human),human,human);
 const {document}=parseHTML(renderPage('<html><body><p>An AI system <em>misaligns</em>.</p><p>The model does not have a <b>propensity</b> to scheme.</p></body></html>','https://example.com/').html);
 assert.equal(document.querySelector('p').textContent,'An AI system malfunctions.');
 assert.equal(document.querySelectorAll('p')[1].textContent,'The model does not have a tendency to pursue unintended goals.');
});
