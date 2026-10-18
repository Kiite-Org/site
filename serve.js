// Development server: builds, serves dist/, and rebuilds when src/ or the KiiteShell docs change.
//
//   npm run dev            # http://localhost:4173
//   PORT=8080 npm run dev

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist");
const KIITE_DIR = path.resolve(process.env.KIITE_DIR || path.join(HERE, "../KiiteShell"));
const PORT = +process.env.PORT || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png",
};

function rebuild() {
  try { build(); } catch (e) { console.error(e.message); }
}
rebuild();

let timer;
const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 120); };
for (const dir of [path.join(HERE, "src"), path.join(KIITE_DIR, "docs")]) fs.watch(dir, { recursive: true }, later);
fs.watch(path.join(KIITE_DIR, "README.md"), later);
fs.watch(path.join(HERE, "build.js"), () => console.log("build.js changed: restart the server to pick it up."));

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": TYPES[".html"] }); fs.createReadStream(path.join(DIST, "404.html")).pipe(res); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Serving http://localhost:${PORT}`));
