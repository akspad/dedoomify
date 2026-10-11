// Capture original Retina PNG frames, not Playwright's lossy video recording.
// All delivery formats are encoded independently from the lossless master.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

export async function startCapture(page, directory) {
  fs.mkdirSync(directory, { recursive: true });
  let running = true;
  const frames = [];
  const capture = (async () => {
    while (running) {
      const time = performance.now();
      const name = `frame-${String(frames.length).padStart(5, "0")}.png`;
      await page.screenshot({ path: path.join(directory, name), type: "png", scale: "device" });
      frames.push({ name, time });
      const remaining = 1000 / 30 - (performance.now() - time);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  })();
  return async () => {
    running = false;
    await capture;
    if (!frames.length) throw new Error("No demo frames captured");
    const end = performance.now();
    const timeline = frames.map((frame, i) => {
      const next = frames[i + 1]?.time ?? end;
      return `file '${frame.name}'\nduration ${Math.max(0.001, (next - frame.time) / 1000).toFixed(6)}`;
    }).join("\n") + `\nfile '${frames.at(-1).name}'\n`;
    const manifest = path.join(directory, "frames.txt");
    fs.writeFileSync(manifest, timeline);
    const master = path.join(directory, "master.mkv");
    ff("-f", "concat", "-safe", "0", "-i", manifest, "-vf", "fps=30", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgr0", "-an", master);
    return master;
  };
}

export function encodeDemo(master, { mp4, gif, webm, poster, speed = 1, posterTime = 6 }) {
  const filter = `setpts=(PTS-STARTPTS)/${speed},fps=30`;
  const input = ["-i", master];
  // CRF 18 preserves fine UI text; 4:2:0 keeps H.264 compatible with Safari.
  ff(...input, "-vf", filter, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4);
  if (webm) ff(...input, "-vf", filter, "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an", webm);
  // Full palette, native README width, and stable dithering for text edges.
  ff(...input, "-filter_complex", `setpts=(PTS-STARTPTS)/${speed},fps=15,scale=1100:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, "-loop", "0", "-an", gif);
  if (poster) ff("-ss", String(posterTime * speed), ...input, "-frames:v", "1", "-c:v", "libwebp", "-quality", "92", "-compression_level", "6", "-update", "1", poster);
}
