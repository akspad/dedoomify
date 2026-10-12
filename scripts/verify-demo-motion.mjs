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
    const playbackSpeed = gif ? 1 : (report.videoSpeed ?? 1);
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" }));
    const expectedDuration = report.duration / playbackSpeed;
    assert(Math.abs(Number(info.format.duration) - expectedDuration) < 0.12, `${file}: expected ${playbackSpeed}× playback (${expectedDuration.toFixed(2)}s)`);
    console.log(`${file}: verified ${playbackSpeed}× playback (${Number(info.format.duration).toFixed(2)}s)`);
    const [n, d] = info.streams[0].avg_frame_rate.split("/").map(Number);
    // GIF merges identical frames in stationary holds; its overall average is
    // lower. Its moving sections still need one distinct frame every 40ms.
    if (!gif) assert.equal(n / d, expectedFps, `${file}: expected 60 fps`);
    for (const motion of motions) {
      const start = (motion.start + motion.duration * 0.1) / playbackSpeed;
      const duration = motion.duration * 0.8 / playbackSpeed;
      // Normalize to CSS pixels and ignore small compression differences: byte
      // hashes alone can mistake H.264 noise in a repeated image for motion.
      const width = reportPath.includes("extension") ? 1280 : 1100;
      const height = reportPath.includes("extension") ? 732 : 704;
      const decoded = execFileSync("ffmpeg", ["-v", "error", "-ss", String(start), "-i", file, "-t", String(duration), "-an", "-vf", `fps=${expectedFps},scale=${width}:${height}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], { maxBuffer: 256 * 1024 * 1024 });
      const frameBytes = width * height * 3;
      const count = decoded.length / frameBytes;
      assert(Number.isInteger(count) && count >= Math.floor(duration * expectedFps) - 1, `${file}: missing movement frames`);
      let moving = 0;
      for (let frame = 1; frame < count; frame++) {
        let changed = 0;
        const offset = frame * frameBytes;
        for (let pixel = 0; pixel < frameBytes; pixel += 3) {
          const difference = Math.abs(decoded[offset + pixel] - decoded[offset + pixel - frameBytes])
            + Math.abs(decoded[offset + pixel + 1] - decoded[offset + pixel + 1 - frameBytes])
            + Math.abs(decoded[offset + pixel + 2] - decoded[offset + pixel + 2 - frameBytes]);
          if (difference > 96 && ++changed >= 8) break;
        }
        if (changed >= 8) moving++;
      }
      assert(moving / (count - 1) >= 0.9, `${file}: visible motion in only ${moving}/${count - 1} adjacent frames at ${start.toFixed(2)}s`);
      console.log(`${file}: visible motion in ${moving}/${count - 1} adjacent decoded frames at ${expectedFps} fps (${start.toFixed(2)}s)`);
    }
  }
}
