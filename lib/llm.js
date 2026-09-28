import Anthropic from "@anthropic-ai/sdk";
import "../shared/dedoom-prompt.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

// Keep a request bounded; anything past this is rewritten by the rules only.
export const MAX_LLM_CHARS = 60_000;

export const SYSTEM_PROMPT = `${globalThis.DedoomPrompt.STYLE_GUIDE}
- Return exactly one output paragraph for each input paragraph, in the same order.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    paragraphs: { type: "array", items: { type: "string" } },
  },
  required: ["paragraphs"],
  additionalProperties: false,
};

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.DEDOOMIFY_LLM !== "off";
}

// Split the block list into the prefix sent to Claude and the remainder.
export function splitForLlm(texts, maxChars = MAX_LLM_CHARS) {
  let used = 0;
  let i = 0;
  for (; i < texts.length; i++) {
    used += texts[i].length;
    if (used > maxChars) break;
  }
  return [texts.slice(0, i), texts.slice(i)];
}

// Rewrite paragraphs with Claude. Returns an array the same length as `texts`,
// or throws if the model's answer can't be used, so the caller can fall back.
export async function dedoomWithClaude(texts, { client, model } = {}) {
  if (texts.length === 0) return [];
  client ??= new Anthropic();
  model ??= process.env.DEDOOMIFY_MODEL || DEFAULT_MODEL;

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Rewrite these ${texts.length} paragraphs. Return {"paragraphs": [...]} with exactly ${texts.length} strings.\n\n` +
          JSON.stringify({ paragraphs: texts }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const parsed = JSON.parse(text);
  const out = parsed?.paragraphs;
  if (!Array.isArray(out) || out.length !== texts.length || out.some((p) => typeof p !== "string")) {
    throw new Error("Claude returned the wrong number of paragraphs");
  }
  return out;
}
