import { parse, walk, generate, ident, tokenize, tokenTypes } from "css-tree";

// Resources share the public-only, DNS-pinned image proxy. Fragment references
// stay local (notably SVG paint servers and clip paths).
export function resourceUrl(value, base) {
  if (value.startsWith("#")) return value;
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return "/api/image?asset=1&url=" + encodeURIComponent(url.href);
  } catch { return ""; }
}

export function rewriteCss(css, base, context = "stylesheet", splitLarge = true) {
  if (!css.trim()) return "";
  try {
    // Large utility stylesheets can contain hundreds of thousands of rules.
    // Parse bounded groups instead of retaining one enormous AST. Tokenization
    // respects strings/comments, so braces inside URLs never split a rule.
    if (splitLarge && context === "stylesheet" && css.length > 64 * 1024) {
      let depth = 0, start = 0, open = 0;
      const parts = [];
      tokenize(css, (type, from, to) => {
        if (type === tokenTypes.LeftCurlyBracket) {
          if (depth === 0) open = from;
          depth++;
        }
        if (type === tokenTypes.RightCurlyBracket) depth--;
        if (depth !== 0 || (type !== tokenTypes.RightCurlyBracket && type !== tokenTypes.Semicolon)) return;
        const rule = css.slice(start, to);
        if (rule.length > 64 * 1024 && /^(?:\s|\/\*[\s\S]*?\*\/)*@(?:media|supports|layer|container|scope|document|starting-style)\b/i.test(rule)) {
          const wrapper = rewriteCss(css.slice(start, open) + "{}", base);
          if (wrapper.endsWith("{}")) parts.push(wrapper.slice(0, -1) + rewriteCss(css.slice(open + 1, from), base) + "}");
        } else {
          parts.push(rewriteCss(rule, base, "stylesheet", false));
        }
        start = to;
      });
      parts.push(rewriteCss(css.slice(start), base, "stylesheet", false));
      return parts.join("");
    }
    const ast = parse(css, { context, parseCustomProperty: true });
    walk(ast, function (node) {
      if (node.type === "Url") node.value = resourceUrl(node.value, base);
      // String-form imports, image candidates and escaped URL functions.
      if (node.type === "Atrule" && ident.decode(node.name).toLowerCase() === "import") {
        node.prelude?.children?.forEach((child) => {
          if (child.type === "String") child.value = resourceUrl(child.value, base);
        });
      }
      if (node.type === "Function" && /^(?:url|src|image|(?:-webkit-)?image-set)$/i.test(ident.decode(node.name))) {
        node.children.forEach((child) => {
          if (child.type === "String") child.value = resourceUrl(child.value, base);
        });
      }
      // Unparsed tokens could hide resource URLs from the walker.
      if (node.type === "Raw") node.value = "";
    });
    // Safe when serialized into an HTML style element.
    return generate(ast).replace(/</g, "\\3c ");
  } catch { return ""; }
}
