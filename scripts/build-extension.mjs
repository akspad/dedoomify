// Copies the shared rule engine into the extension folder, which has to be
// self-contained to load as an unpacked extension, then zips the folder into
// dist/ for the Chrome Web Store and Edge Add-ons.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

fs.copyFileSync(new URL("../shared/dedoom-core.js", import.meta.url), new URL("../extension/dedoom-core.js", import.meta.url));
console.log("Copied shared/dedoom-core.js to extension/dedoom-core.js");

const { version } = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url);
fs.mkdirSync(dist, { recursive: true });
const zip = new URL(`dedoomify-extension-${version}.zip`, dist).pathname;
fs.rmSync(zip, { force: true });
try {
  // -X leaves out file owner and time extras; manifest.json sits at the zip's root, as the stores require.
  execFileSync("zip", ["-r", "-X", "-q", zip, ".", "-x", ".*", "-x", "*/.*"], { cwd: new URL("../extension/", import.meta.url).pathname });
  console.log(`Wrote dist/dedoomify-extension-${version}.zip`);
} catch {
  console.log("`zip` isn't installed, so no zip was made. Zip the contents of extension/ by hand to upload it.");
}
