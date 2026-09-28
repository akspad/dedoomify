// Copies the shared rule engine into the extension folder, which has to be
// self-contained to load as an unpacked extension.
import fs from "node:fs";
fs.copyFileSync(new URL("../shared/dedoom-core.js", import.meta.url), new URL("../extension/dedoom-core.js", import.meta.url));
console.log("Copied shared/dedoom-core.js to extension/dedoom-core.js");
