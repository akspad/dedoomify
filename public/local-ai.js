// On-device rewriting with a small open model running in the browser on
// WebGPU, through WebLLM. Inference sends no article text to an external LLM
// API; the model downloads once from Hugging Face and is cached by the browser.
// The website's initial phrase-rule pass still goes through dedoomify's server.
// The pure helpers at the top
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
const AI_CONTEXT = new RegExp(globalThis.Dedoom.softwareSubjectSource + "\\b|\\b(?:models?|bots?|agents?|assistants?|systems?|OpenAI|Anthropic|DeepMind)\\b", "i");

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

// Curly/double quotation marks in order. Paired ASCII speech is checked by
// quotedText below, using the same boundaries as the rules.
function quoteMarks(text) {
  return (text.match(/["\u2018\u2019\u201c\u201d\u00ab\u00bb\u201e]/g) || []).join("");
}

// Use exactly the same quote boundaries as the phrase rules (including
// paired ASCII speech and apostrophes inside speech).
function quotedText(text) {
  return globalThis.Dedoom.quoteProtectedSegments(text)
    .filter((segment) => segment.protected).map((segment) => segment.text).join("\u0000");
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
  /\b(?:no|not|never|none|all|any|some|few|many|most|only|may|might|can|could|will|would|should|must|more|less|fewer|higher|lower|before|after|until|unless|if|except|without|likely|unlikely|certain|certainly|uncertain|possibly|possible|impossible|always|usually|often|sometimes|rarely|seldom|increase\w*|decrease\w*|rise|rises|rose|rising|fall|falls|fell|falling|better|worse|greater|smaller|because|cause\w*|led|result\w*|safe|unsafe|safety|kill\w*|destroy\w*|threaten\w*|escap\w*|blackmail\w*|up|down|at least|at most)\b/gi;

function semanticInvariants(text) {
  return (text.match(SEMANTIC_INVARIANTS) || []).map((w) => w.toLowerCase());
}

// Keep short names, pronouns, units and non-English words too. Avoid stemming
// or truncation: "Bob"/"Ian", "pm"/"am", and "researcher"/"research" differ.
// Keep articles too: "A" can name a model and "[a]" can be a citation.
const REPORTING = new Set(["warn", "warned", "say", "said", "says", "report", "reported", "reports", "noted", "notes", "wrote"]);
function contentWords(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s]/gu) || [];
}
// Accept a rewrite only if it plausibly kept the facts. Small models sometimes
// invent details ("deceived its creators"), drop who said what, or drop and
// straighten quotation marks or periods, so besides
// the shape checks, every content word must survive unless it's doom framing
// the rules also change, and new words must come from the phrases that actually changed.
// Otherwise the caller keeps the phrase-rules version.
export function acceptRewrite(original, rewritten) {
  if (!rewritten) return false;
  if (/\n\s*\n/.test(rewritten)) return false;
  const ratio = rewritten.length / Math.max(original.length, 1);
  if (ratio < 0.6 || ratio > 1.7) return false;
  if (numbersIn(rewritten).join("\u0000") !== numbersIn(original).join("\u0000")) return false;
  if (semanticInvariants(rewritten).join("\u0000") !== semanticInvariants(original).join("\u0000")) return false;
  // Numbers alone miss currency, percentages and mathematical qualifiers.
  if ((rewritten.match(/[$€£¥%+−<>≤≥=]/g) || []).join("") !==
      (original.match(/[$€£¥%+−<>≤≥=]/g) || []).join("")) return false;
  if (quoteMarks(rewritten) !== quoteMarks(original)) return false;
  if (quotedText(rewritten) !== quotedText(original)) return false;
  if (stops(rewritten) !== stops(original)) return false;

  // Exempt only the matched occurrences. Paragraph-selection hints never
  // grant permission to erase factual words in unrelated occurrences.
  // Generic agents/models/assistants can be people, so require an explicit
  // AI qualifier or an unambiguous software/model name for this exception.
  const deception = new RegExp("(" + globalThis.Dedoom.softwareSubjectSource + ")\\s+decided to deceive\\b", "gi");
  const reference = globalThis.Dedoom.quoteProtectedSegments(original).map((seg) =>
    seg.protected ? seg.text : seg.text.replace(deception, "$1 produced misleading output for"),
  ).join("");
  const segments = globalThis.Dedoom.dedoomSegments(reference);
  const afterWords = contentWords(rewritten);
  // Match replacements in their original positions. Vocabulary and counts
  // alone cannot stop "The model is misaligned. Bob spoke." becoming
  // "The model. Bob has a bug spoke." Keep punctuation in these tokens too,
  // so sentence boundaries, units and currency remain attached to their facts.
  let positions = new Set([0]);
  for (const seg of segments) {
    const variants = [seg.text];
    if (seg.original !== undefined) {
      variants.push(seg.original);
      if (seg.original.toLowerCase() === "human extinction") variants.push("a very bad outage");
    }
    const next = new Set();
    for (const variant of variants) {
      const words = contentWords(variant);
      for (const at of positions) {
        let cursor = at;
        const matches = words.every((word) => {
          // Permit only an inserted reporting complementizer ("warn that").
          // Existing "that" still has to survive, including as an object.
          if (word !== "that" && /^\p{L}/u.test(word) && afterWords[cursor] === "that" && REPORTING.has(afterWords[cursor - 1]) && afterWords[cursor + 1] === word) cursor++;
          return afterWords[cursor++] === word;
        });
        if (matches) next.add(cursor);
      }
    }
    if (next.size === 0) return false;
    positions = next;
  }
  if (!positions.has(afterWords.length)) return false;
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
