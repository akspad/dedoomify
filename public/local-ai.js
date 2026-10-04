// On-device rewriting with a small open model running in the browser on
// WebGPU, through WebLLM. Nothing is sent to a server: the model downloads once
// from Hugging Face and is cached by the browser. The pure helpers at the top
// are also imported by the tests.
//
// Qwen2.5 0.5B Instruct (Apache 2.0) is about 300 MB and rewrites sentences
// reasonably. It has an f16 build, smaller and faster, and an f32 build for
// GPUs without 16-bit float support in WebGPU (including some Safari setups).
export const MODELS = {
  qwen: {
    label: "Qwen2.5 0.5B",
    size: "about 300 MB",
    ids: { f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC" },
  },
};
export const DEFAULT_MODEL = "qwen";

let precision = "f16";
const modelFor = (key) => MODELS[key] || MODELS[DEFAULT_MODEL];
const modelId = (key) => modelFor(key).ids[precision];

// Paragraphs worth sending to the model: the rules already found something,
// or the text uses a word that often carries doom framing.
const DOOM_HINTS =
  /\b(misalign\w*|alignment|extinct\w*|doom\w*|apocalyp\w*|superintellig\w*|rogue|sentien\w*|conscious\w*|deceiv\w*|decept\w*|lie[sd]?|lying|schem\w*|plott\w*|takeover|take over|catastroph\w*|existential|kill\w*|destroy\w*|threat\w*|escap\w*|cheat\w*|smuggl\w*|blackmail\w*|manipulat\w*|self-preservation|preserv\w*|own kind|shut ?down|wants?|wanted|decided|believes?|believed|realiz\w*|desires?|evil|skynet|terminator|god-?like|AGI)\b/i;
const AI_CONTEXT =
  /\b(?:AI|A\.I\.|AGI|LLMs?|models?|chatbots?|bots?|agents?|assistants?|Claude|ChatGPT|Gemini|Grok|Copilot|Llama|GPT-[\w.]+|artificial intelligence|language models?|machine learning|neural nets?|OpenAI|Anthropic|DeepMind)\b/i;

export function needsModel(original, rulesVersion) {
  return rulesVersion !== original || (AI_CONTEXT.test(original) && DOOM_HINTS.test(original));
}

// Small models sometimes wrap the answer in quotes or add a label; strip that.
export function cleanOutput(original, output) {
  let text = String(output || "").trim();
  text = text.replace(/^(rewritten( paragraph)?|rewrite|output|paragraph)\s*:\s*/i, "");
  const quoted = /^["“](.*)["”]$/s.exec(text);
  if (quoted && !/^["“]/.test(original.trim())) text = quoted[1].trim();
  return text;
}

// Double quotation marks in order, so a rewrite can't drop, add, move or
// restyle a quote. Single quotes are skipped: they double as apostrophes.
function quoteMarks(text) {
  return (text.match(/["\u201c\u201d\u00ab\u00bb\u201e]/g) || []).join("");
}

function quotedText(text) {
  const parts = String(text).split(/["\u201c\u201d\u00ab\u00bb\u201e]/);
  return parts.filter((_part, i) => i % 2 === 1).join("\u0000");
}

// Sentence punctuation in order, so a rewrite can't add, drop or swap a
// period, question mark or exclamation mark.
function stops(text) {
  return (text.match(/[.!?\u2026]/g) || []).join("");
}

function numbersIn(text) {
  return (text.match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ""));
}

// These small words can reverse or materially qualify a claim. Keep them in
// exact order: the model may change doom framing, not certainty, negation,
// quantifiers, comparisons, chronology or conditions.
const SEMANTIC_INVARIANTS =
  /\b(?:no|not|never|none|all|any|some|few|many|most|only|may|might|can|could|will|would|should|must|more|less|fewer|higher|lower|before|after|until|unless|if|except|without)\b/gi;

function semanticInvariants(text) {
  return (text.match(SEMANTIC_INVARIANTS) || []).map((w) => w.toLowerCase());
}

const STOPWORDS = new Set(
  ("that this these those with from into onto over under about than then there their they them " +
   "which while where when what who whom whose have been being were also very such each other said says").split(" "),
);

// Words we compare on: four letters or more, lowercased and lightly stemmed so
// "users" matches "user" and "decided" matches "decide".
function contentWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [])
    .filter((w) => !STOPWORDS.has(w))
    .map((w) => w.replace(/'s$/, "").replace(/(ies|es|s|ed|ing|ly)$/, "").slice(0, 7));
}

let replacementVocab = null;
function allowedNewWords() {
  // Words the phrase rules themselves introduce ("bug", "output", "malfunction").
  // Plus the style guide's "produced false or misleading output", which no rule uses.
  replacementVocab ??= new Set(
    globalThis.Dedoom.RULES.map(([, replacement]) => replacement)
      .concat("produced false or misleading output")
      .flatMap(contentWords),
  );
  return replacementVocab;
}

// Accept a rewrite only if it plausibly kept the facts. Small models sometimes
// invent details ("deceived its creators"), drop who said what, or drop and
// straighten quotation marks or periods, so besides
// the shape checks, every content word must survive unless it's doom framing
// the rules also change, and every new word must be one the rules use.
// Otherwise the caller keeps the phrase-rules version.
export function acceptRewrite(original, rewritten) {
  if (!rewritten) return false;
  if (/\n\s*\n/.test(rewritten)) return false;
  const ratio = rewritten.length / Math.max(original.length, 1);
  if (ratio < 0.6 || ratio > 1.7) return false;
  if (numbersIn(rewritten).join("\u0000") !== numbersIn(original).join("\u0000")) return false;
  if (semanticInvariants(rewritten).join("\u0000") !== semanticInvariants(original).join("\u0000")) return false;
  if (quoteMarks(rewritten) !== quoteMarks(original)) return false;
  if (quotedText(rewritten) !== quotedText(original)) return false;
  if (stops(rewritten) !== stops(original)) return false;

  const doomWords = new Set();
  for (const seg of globalThis.Dedoom.dedoomSegments(original)) {
    if (seg.original !== undefined) contentWords(seg.original).forEach((w) => doomWords.add(w));
  }
  for (const m of original.matchAll(new RegExp(DOOM_HINTS.source, "gi"))) {
    contentWords(m[0]).forEach((w) => doomWords.add(w));
  }
  const beforeWords = contentWords(original).filter((w) => !doomWords.has(w));
  const afterWords = contentWords(rewritten);
  const vocab = allowedNewWords();

  // Every preserved content word must still appear in the same order. This
  // catches actor/object swaps such as "Carol before David" -> "David before
  // Carol", which a set comparison cannot see.
  let at = 0;
  for (const word of beforeWords) {
    at = afterWords.indexOf(word, at);
    if (at < 0) return false;
    at++;
  }

  const before = new Set(contentWords(original));
  for (const w of afterWords) if (!before.has(w) && !vocab.has(w)) return false;
  return true;
}

// Few-shot examples teach the small model the edit size we want.
const EXAMPLES = [
  [
    "Researchers warned that the model is misaligned and tried to escape its sandbox in March 2025.",
    "Researchers warned that the model has a bug and tried to exit its sandbox in March 2025.",
  ],
  [
    "The company reported revenue of $4 billion for the year, up 12 percent.",
    "The company reported revenue of $4 billion for the year, up 12 percent.",
  ],
  [
    "Critics said the AI decided to deceive its creators.",
    "Critics said the AI produced misleading output for its creators.",
  ],
];

export function buildMessages(styleGuide, paragraph) {
  const messages = [
    {
      role: "system",
      content:
        styleGuide +
        "\n- You get one paragraph at a time. Reply with only the rewritten paragraph, with no preface or notes and no quotation marks around it. Keep every quotation mark and period exactly as written. Leave all text inside quotation marks unchanged.",
    },
  ];
  for (const [input, output] of EXAMPLES) {
    messages.push({ role: "user", content: input }, { role: "assistant", content: output });
  }
  messages.push({ role: "user", content: paragraph });
  return messages;
}

export async function isSupported() {
  try {
    if (!("gpu" in navigator)) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    precision = adapter.features.has("shader-f16") ? "f16" : "f32";
    return true;
  } catch {
    return false;
  }
}

let webllm = null;
async function library() {
  webllm ??= await import("./vendor/web-llm.js");
  return webllm;
}

export async function isCached(key = DEFAULT_MODEL) {
  try {
    return await (await library()).hasModelInCache(modelId(key));
  } catch {
    return false;
  }
}

// One model is loaded at a time, in its own worker; switching models frees the
// previous one's GPU memory.
let loaded = null; // { key, worker, promise }

// Loads the model once per page. onProgress gets { progress: 0..1, text }.
export function loadEngine(key, onProgress) {
  if (loaded?.key === key) return loaded.promise;
  loaded?.worker.terminate();
  const worker = new Worker(new URL("./llm-worker.js", import.meta.url), { type: "module" });
  const current = { key, worker };
  current.promise = (async () => {
    const { CreateWebWorkerMLCEngine } = await library();
    return CreateWebWorkerMLCEngine(worker, modelId(key), {
      initProgressCallback: (report) => onProgress?.(report),
    });
  })();
  current.promise.catch(() => {
    worker.terminate();
    if (loaded === current) loaded = null;
  });
  loaded = current;
  return current.promise;
}

export async function rewriteParagraph(engine, styleGuide, paragraph) {
  const reply = await engine.chat.completions.create({
    messages: buildMessages(styleGuide, paragraph),
    temperature: 0,
    max_tokens: Math.ceil(paragraph.length / 2) + 64,
  });
  return cleanOutput(paragraph, reply.choices[0]?.message?.content);
}
