// On-device rewriting with a small open model (Qwen2.5 1.5B Instruct, Apache
// 2.0) running in the browser through WebLLM and WebGPU. Nothing is sent to a
// server: the model downloads once from Hugging Face and is cached by the
// browser. The pure helpers at the top are also imported by the tests.

export const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const MODEL_LABEL = "Qwen2.5 1.5B";

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

// Accept a rewrite only if it plausibly kept the facts: same numbers, one
// paragraph, and roughly the same length. Otherwise the caller keeps the
// phrase-rules version.
export function acceptRewrite(original, rewritten) {
  if (!rewritten) return false;
  if (/\n\s*\n/.test(rewritten)) return false;
  const ratio = rewritten.length / Math.max(original.length, 1);
  if (ratio < 0.6 || ratio > 1.7) return false;
  const have = new Set(numbersIn(rewritten));
  return numbersIn(original).every((n) => have.has(n));
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
    "Critics said the AI decided to deceive its creators to avoid being shut down.",
    "Critics said the AI produced misleading output and failed to shut down.",
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
    return Boolean(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

let webllm = null;
async function library() {
  webllm ??= await import("./vendor/web-llm.js");
  return webllm;
}

export async function isCached() {
  try {
    return await (await library()).hasModelInCache(MODEL_ID);
  } catch {
    return false;
  }
}

let enginePromise = null;

// Loads the model once per page. onProgress gets { progress: 0..1, text }.
export function loadEngine(onProgress) {
  enginePromise ??= (async () => {
    const { CreateWebWorkerMLCEngine } = await library();
    const worker = new Worker(new URL("./llm-worker.js", import.meta.url), { type: "module" });
    return CreateWebWorkerMLCEngine(worker, MODEL_ID, {
      initProgressCallback: (report) => onProgress?.(report),
    });
  })();
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

export async function rewriteParagraph(engine, styleGuide, paragraph) {
  const reply = await engine.chat.completions.create({
    messages: buildMessages(styleGuide, paragraph),
    temperature: 0,
    max_tokens: Math.ceil(paragraph.length / 2) + 64,
  });
  return cleanOutput(paragraph, reply.choices[0]?.message?.content);
}
