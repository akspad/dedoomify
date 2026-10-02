// Runs Gemma through Transformers.js off the main thread. WebLLM doesn't ship
// Gemma 3 270M, so this worker speaks a small protocol of its own:
//   { type: "load", repo, dtype }           -> progress..., then ready or error
//   { type: "generate", id, messages, max } -> { type: "result", id, text } or error
import { env, pipeline } from "./vendor/transformers.js";

// Load ONNX Runtime from this site rather than a CDN, as a plain module import
// (the default wasm cache would import it from a blob: URL, which the CSP blocks).
env.useWasmCache = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL("./vendor/ort-wasm-simd-threaded.asyncify.mjs", import.meta.url).href,
  wasm: new URL("./vendor/ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href,
};
env.allowLocalModels = false;

let generator = null;

async function load({ repo, dtype }) {
  // Progress arrives per file; report bytes across all of them.
  const files = new Map();
  generator = await pipeline("text-generation", repo, {
    device: "webgpu",
    dtype,
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      self.postMessage({ type: "progress", progress: loaded / total });
    },
  });
}

self.onmessage = async ({ data }) => {
  if (data.type === "load") {
    try {
      await load(data);
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err?.message || err) });
    }
  } else if (data.type === "generate") {
    try {
      const [out] = await generator(data.messages, { max_new_tokens: data.max, do_sample: false });
      self.postMessage({ type: "result", id: data.id, text: out.generated_text.at(-1).content });
    } catch (err) {
      self.postMessage({ type: "result", id: data.id, error: String(err?.message || err) });
    }
  }
};
