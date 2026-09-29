// On-device rewriting with a small open model running in the browser through
// WebLLM and WebGPU. Nothing is sent to a server: the model downloads once
// from Hugging Face and is cached by the browser. The pure helpers at the top
// are also imported by the tests.
//
// Qwen2.5 0.5B Instruct (Apache 2.0) is the default: the smallest model that
// still rewrites sentences reasonably, about 10 seconds to download on a fast
// home connection. SmolLM2 360M Instruct (Apache 2.0) is a lighter choice for
// slow connections or small GPUs; it follows the style guide less often, so
// more paragraphs keep the phrase-rules version.
//
// Each model has an f16 build, smaller and faster, and an f32 build for GPUs
// without 16-bit float support in WebGPU (including some Safari setups).
export const MODELS = {
  qwen: {
    label: "Qwen2.5 0.5B",
    size: "about 300 MB",
    ids: { f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC" },
  },
  smol: {
    label: "SmolLM2 360M",
    size: "about 200 MB",
    ids: { f16: "SmolLM2-360M-Instruct-q4f16_1-MLC", f32: "SmolLM2-360M-Instruct-q4f32_1-MLC" },
  },
};
export const DEFAULT_MODEL = "qwen";

let precision = "f16";
const modelId = (key) => (MODELS[key] || MODELS[DEFAULT_MODEL]).ids[precision];

// Paragraphs worth sending to the model: the rules already found something,
// or the text uses a word that often carries doom framing.
const DOOM_HINTS =
  /\b(misalign\w*|alignment|extinct\w*|doom\w*|apocalyp\w*|superintellig\w*|rogue|sentien\w*|conscious\w*|deceiv\w*|decept\w*|lie[sd]?|lying|schem\w*|plott\w*|takeover|take over|catastroph\w*|existential|kill\w*|destroy\w*|threat\w*|escap\w*|cheat\w*|smuggl\w*|blackmail\w*|manipulat\w*|self-preservation|shut ?down|wants?|wanted|decided|believes?|believed|realiz\w*|desires?|evil|skynet|terminator|god-?like|AGI)\b/i;

export function needsModel(original, rulesVersion) {
  return rulesVersion !== original || DOOM_HINTS.test(original);
}

// Small models sometimes wrap the answer in quotes or add a label; strip that.
export function cleanOutput(original, output) {
  let text = String(output || "").trim();
  text = text.replace(/^(rewritten( paragraph)?|rewrite|output|paragraph)\s*:\s*/i, "");
  const quoted = /^["“](.*)["”]$/s.exec(text);
  if (quoted && !/^["“]/.test(original.trim())) text = quoted[1].trim();
  return text;
}

function numbersIn(text) {
  return (text.match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ""));
}

const STOPWORDS = new Set(
  ("that this these those with from into onto over under about after before than then there their they them " +
   "which while where when what who whom whose will would could should might must have been being were also " +
   "some just only very more most such each other said says").split(" "),
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
  replacementVocab ??= new Set(globalThis.Dedoom.RULES.flatMap(([, replacement]) => contentWords(replacement)));
  return replacementVocab;
}

// Accept a rewrite only if it plausibly kept the facts. Small models sometimes
// invent details ("deceived its creators") or drop who said what, so besides
// the shape checks, every content word must survive unless it's doom framing
// the rules also change, and every new word must be one the rules use.
// Otherwise the caller keeps the phrase-rules version.
export function acceptRewrite(original, rewritten) {
  if (!rewritten) return false;
  if (/\n\s*\n/.test(rewritten)) return false;
  const ratio = rewritten.length / Math.max(original.length, 1);
  if (ratio < 0.6 || ratio > 1.7) return false;
  const have = new Set(numbersIn(rewritten));
  if (!numbersIn(original).every((n) => have.has(n))) return false;

  const doomWords = new Set();
  for (const seg of globalThis.Dedoom.dedoomSegments(original)) {
    if (seg.original !== undefined) contentWords(seg.original).forEach((w) => doomWords.add(w));
  }
  for (const m of original.matchAll(new RegExp(DOOM_HINTS.source, "gi"))) {
    contentWords(m[0]).forEach((w) => doomWords.add(w));
  }
  const before = new Set(contentWords(original));
  const after = new Set(contentWords(rewritten));
  for (const w of before) if (!after.has(w) && !doomWords.has(w)) return false;
  const vocab = allowedNewWords();
  for (const w of after) if (!before.has(w) && !vocab.has(w)) return false;
  return true;
}

// Few-shot examples teach the small model the edit size we want.
const EXAMPLES = [
  [
    "Researchers warned that the model is misaligned and tried to escape its sandbox in March 2025.",
    "Researchers warned that the model has a bug and tried to run outside its sandbox in March 2025.",
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
        "\n- You get one paragraph at a time. Reply with only the rewritten paragraph: no preface, quotation marks or notes.",
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
