// Copies browser-side files into public/vendor/ so the site serves them itself:
// the shared rules and prompt, and the WebLLM library for the on-device model.
// Runs as Vercel's build command and before `npm run dev`.
import fs from "node:fs";

const out = new URL("../public/vendor/", import.meta.url);
fs.mkdirSync(out, { recursive: true });

const copies = [
  ["../shared/dedoom-core.js", "dedoom-core.js"],
  ["../shared/dedoom-prompt.js", "dedoom-prompt.js"],
  ["../node_modules/@mlc-ai/web-llm/lib/index.js", "web-llm.js"],
];
for (const [from, to] of copies) {
  fs.copyFileSync(new URL(from, import.meta.url), new URL(to, out));
}
console.log(`Copied ${copies.length} files to public/vendor/`);
