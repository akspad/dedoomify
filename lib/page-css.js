import { parse, walk, generate, ident } from "css-tree";

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

export function rewriteCss(css, base, context = "stylesheet") {
  if (!css.trim()) return "";
  try {
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
