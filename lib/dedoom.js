import "../shared/dedoom-core.js";
import { dedoomWithClaude, llmEnabled, splitForLlm } from "./llm.js";

const { dedoomText } = globalThis.Dedoom;

// Rewrite every block of an article. Uses Claude when it is configured and the
// caller asked for it, and the phrase rules otherwise or if Claude fails.
export async function dedoomArticle(article, { mode = "auto", llm = dedoomWithClaude, log = console } = {}) {
  // The title goes first so it gets rewritten along with the body.
  const texts = [article.title, ...article.blocks.map((b) => b.text)];
  let rewritten = null;
  let engine = "rules";
  let notice = null;

  const wantClaude = mode !== "rules" && llmEnabled();
  if (wantClaude) {
    const [head, tail] = splitForLlm(texts);
    try {
      const fromClaude = await llm(head);
      rewritten = [...fromClaude, ...tail.map(dedoomText)];
      engine = "claude";
      if (tail.length > 0) {
        notice = `This article is long, so the last ${tail.length} paragraphs were rewritten with the quick phrase rules.`;
      }
    } catch (err) {
      log.error("Claude rewrite failed, using rules:", err?.message || err);
      notice = "Claude wasn't available, so this was rewritten with the quick phrase rules.";
    }
  } else if (mode === "claude") {
    notice = "Claude isn't configured on this server, so this was rewritten with the quick phrase rules.";
  }

  rewritten ??= texts.map(dedoomText);

  const [title, ...body] = rewritten;
  const blocks = article.blocks.map((b, i) => ({
    type: b.type,
    original: b.text,
    // Blockquotes are direct quotations even when their punctuation is supplied
    // by HTML/CSS rather than literal quote characters.
    text: b.type === "quote" ? b.text : body[i],
  }));
  const changed = blocks.filter((b) => b.text !== b.original).length;
  return { ...article, title, originalTitle: article.title, blocks, engine, changed, notice };
}
