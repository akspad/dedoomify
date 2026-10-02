// Copies browser-side files into public/vendor/ so the site serves them itself:
// the shared rules, prompt and page rewriter, and the WebLLM and Transformers.js
// libraries (plus ONNX Runtime's WebAssembly files) for the on-device models.
// Runs as Vercel's build command and before `npm run dev`.
import fs from "node:fs";

const out = new URL("../public/vendor/", import.meta.url);
fs.mkdirSync(out, { recursive: true });

const copies = [
  ["../shared/dedoom-core.js", "dedoom-core.js"],
  ["../shared/dedoom-prompt.js", "dedoom-prompt.js"],
  ["../shared/page-dedoom.js", "page-dedoom.js"],
  ["../node_modules/@mlc-ai/web-llm/lib/index.js", "web-llm.js"],
  ["../node_modules/@huggingface/transformers/dist/transformers.min.js", "transformers.js"],
  ["../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.mjs"],
  ["../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.wasm"],
];
for (const [from, to] of copies) {
  fs.copyFileSync(new URL(from, import.meta.url), new URL(to, out));
}
console.log(`Copied ${copies.length} files to public/vendor/`);
