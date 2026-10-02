// Lokale Vorschau der Landingpage (Ordner marketing/), ohne Zusatzpakete.
// Start über .claude/launch.json (Konfiguration "landingpage") oder: node scripts/vorschau-landingpage.cjs
// Liefert Teilabrufe (Range) aus, damit das Video im Browser spulbar ist wie bei IONOS.
const http = require("http");
const fs = require("fs");
const path = require("path");

const WURZEL = path.join(__dirname, "..", "marketing");
const PORT = Number(process.env.PORT) || 3031;
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".mp4": "video/mp4", ".woff2": "font/woff2",
};

http.createServer((req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const datei = path.join(WURZEL, pfad === "/" ? "index.html" : pfad);
  if (!datei.startsWith(WURZEL)) { res.writeHead(403).end(); return; }
  fs.stat(datei, (fehler, info) => {
    if (fehler || !info.isFile()) { res.writeHead(404).end("Nicht gefunden"); return; }
    const kopf = { "Content-Type": TYPEN[path.extname(datei).toLowerCase()] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    const bereich = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (bereich) {
      const start = bereich[1] ? Number(bereich[1]) : 0;
      const ende = bereich[2] ? Math.min(Number(bereich[2]), info.size - 1) : info.size - 1;
      if (start > ende) { res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return; }
      res.writeHead(206, { ...kopf, "Content-Range": `bytes ${start}-${ende}/${info.size}`, "Content-Length": ende - start + 1 });
      fs.createReadStream(datei, { start, end: ende }).pipe(res);
      return;
    }
    res.writeHead(200, { ...kopf, "Content-Length": info.size });
    fs.createReadStream(datei).pipe(res);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Landingpage-Vorschau: http://localhost:${PORT}`));
