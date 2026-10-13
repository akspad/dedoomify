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
