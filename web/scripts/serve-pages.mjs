// Serves the built site (web/out) at http://localhost:4173/dawn/, the way GitHub Pages does,
// to try the published version before pushing: build with DAWN_BASE_PATH=/dawn, then
// `npm run serve:pages --workspace @dawn/web`.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const out = join(import.meta.dirname, "..", "out");
const BASE = "/dawn";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".map": "application/json",
};

function file(path) {
  try {
    const s = statSync(path);
    if (s.isDirectory()) return file(join(path, "index.html"));
    return path;
  } catch {
    return existsHtml(path);
  }
}
function existsHtml(path) {
  try {
    statSync(`${path}.html`);
    return `${path}.html`;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(`${BASE}/`)) {
    res.writeHead(302, { location: `${BASE}/` }).end();
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(BASE.length)));
  const found = file(join(out, rel));
  if (!found || !found.startsWith(out)) {
    res.writeHead(404, { "content-type": "text/html" });
    createReadStream(join(out, "404.html")).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(found)] ?? "application/octet-stream" });
  createReadStream(found).pipe(res);
}).listen(4173, "0.0.0.0", () => {
  console.log(`Serving web/out at http://localhost:4173${BASE}/`);
});
