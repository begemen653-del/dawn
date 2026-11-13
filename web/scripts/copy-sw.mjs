// After `next build`: copies the service worker from /serwist/sw.js to the site root (/sw.js).
// A service worker only controls pages inside its own folder unless the server sends a
// "Service-Worker-Allowed" header, which static hosts don't do by default. At the root it
// controls the whole app on any host.
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(import.meta.dirname, "..", "out");
await copyFile(join(out, "serwist", "sw.js"), join(out, "sw.js"));
await copyFile(join(out, "serwist", "sw.js.map"), join(out, "sw.js.map"));
