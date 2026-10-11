// Check decoded playback, so an encoder that repeats frames cannot pass simply
// because capture produced distinct PNGs. Inspect the middle of every long move.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const pairs = [
  ["dist/site-demo-motion.json", ["public/demo.mp4", "public/demo.webm", "docs/demo.gif"]],
  ["dist/extension-demo-motion.json", ["docs/extension-demo.mp4", "docs/extension-demo.gif"]],
];

for (const [reportPath, media] of pairs) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const motions = report.motions.filter((move) => move.distance >= 100);
  assert(motions.length > 0, `${reportPath}: no substantial cursor movements recorded`);
  for (const file of media) {
    const gif = file.endsWith(".gif");
    const expectedFps = gif ? 25 : 60;
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate", "-of", "json", file], { encoding: "utf8" }));
    const [n, d] = info.streams[0].avg_frame_rate.split("/").map(Number);
    // GIF merges identical frames in stationary holds; its overall average is
    // lower. Its moving sections still need one distinct frame every 40ms.
    if (!gif) assert.equal(n / d, expectedFps, `${file}: expected 60 fps`);
    for (const motion of motions) {
      const start = motion.start + motion.duration * 0.1;
      const duration = motion.duration * 0.8;
      const decoded = execFileSync("ffmpeg", ["-v", "error", "-ss", String(start), "-i", file, "-t", String(duration), "-an", "-vf", `fps=${expectedFps}`, "-f", "framemd5", "-"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      const hashes = decoded.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(",").at(-1).trim());
      const unique = new Set(hashes).size;
      assert(hashes.length >= Math.floor(duration * expectedFps) - 1, `${file}: missing movement frames`);
      assert(unique / hashes.length >= 0.9, `${file}: only ${unique}/${hashes.length} distinct frames during movement at ${start.toFixed(2)}s`);
      console.log(`${file}: ${unique}/${hashes.length} distinct decoded cursor frames at ${expectedFps} fps (${start.toFixed(2)}s)`);
    }
  }
}
