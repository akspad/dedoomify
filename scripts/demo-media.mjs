// Frame-driven Retina capture: rendering may be slow, but playback timing is
// independent of screenshot latency. Every cursor position gets its own frame.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const VIDEO_FPS = 60;
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

export async function startCapture(page, directory, { reportPath } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const frames = [];
  const motions = [];
  let elapsed = 0;
  let at;

  async function frame(duration = 1 / VIDEO_FPS) {
    const name = `frame-${String(frames.length).padStart(5, "0")}.png`;
    const pixels = await page.screenshot({ path: path.join(directory, name), type: "png", scale: "device", animations: "disabled" });
    frames.push({ name, duration, hash: createHash("sha256").update(pixels).digest("hex") });
    elapsed += duration;
  }

  async function cursor(point) {
    await page.mouse.move(point.x, point.y);
    await page.locator("#demo-cursor, #cursor").evaluate((element, { x, y }) => {
      element.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
    }, point);
    at = point;
  }

  async function moveTo(x, y, duration = 0.8) {
    if (!at) throw new Error("Set the initial cursor position before moving");
    const from = at;
    const count = Math.max(2, Math.round(duration * VIDEO_FPS));
    const first = frames.length;
    const start = elapsed;
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await cursor({ x: from.x + (x - from.x) * ease, y: from.y + (y - from.y) * ease });
      await frame();
    }
    const uniqueFrames = new Set(frames.slice(first).map((item) => item.hash)).size;
    motions.push({ start, duration: count / VIDEO_FPS, frames: count, uniqueFrames, distance: Math.hypot(x - from.x, y - from.y) });
  }

  async function hold(milliseconds) {
    // Let hover cards and UI transitions settle, then hold that complete frame.
    await page.waitForTimeout(Math.min(milliseconds, 200));
    await frame(milliseconds / 1000);
  }

  async function finish() {
    if (!frames.length) throw new Error("No demo frames captured");
    const timeline = "ffconcat version 1.0\n" + frames.map((item) =>
      `file '${item.name}'\noption framerate ${VIDEO_FPS}\nduration ${item.duration.toFixed(9)}`
    ).join("\n") + `\nfile '${frames.at(-1).name}'\noption framerate ${VIDEO_FPS}\n`;
    const manifest = path.join(directory, "frames.txt");
    fs.writeFileSync(manifest, timeline);
    const master = path.join(directory, "master.mkv");
    ff("-f", "concat", "-safe", "0", "-i", manifest, "-vf", `fps=${VIDEO_FPS}`, "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgr0", "-an", master);
    if (reportPath) fs.writeFileSync(reportPath, JSON.stringify({ fps: VIDEO_FPS, duration: elapsed, motions }, null, 2));
    console.log(`Captured ${frames.length} Retina images for ${elapsed.toFixed(2)}s of playback; ${motions.length} cursor movements`);
    return master;
  }

  return { cursor, moveTo, frame, hold, finish };
}

export function encodeDemo(master, { mp4, gif, webm, poster, speed = 1, posterTime = 6 }) {
  const filter = `setpts=(PTS-STARTPTS)/${speed},fps=${VIDEO_FPS}`;
  const input = ["-i", master];
  ff(...input, "-vf", filter, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4);
  if (webm) ff(...input, "-vf", filter, "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", "-cpu-used", "4", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an", webm);
  // 25 fps uses exact 40ms GIF delays rather than uneven rounded frame timing.
  ff(...input, "-filter_complex", `setpts=(PTS-STARTPTS)/${speed},fps=25,scale=1100:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, "-loop", "0", "-an", gif);
  if (poster) ff("-ss", String(posterTime * speed), ...input, "-frames:v", "1", "-c:v", "libwebp", "-quality", "92", "-compression_level", "6", "-update", "1", poster);
}
