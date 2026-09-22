// Wandelt Email_Maler_BW_<datum>.csv (Semikolon, deutsches Excel) in eine Mailchimp-Importdatei um:
// Komma-getrennt, UTF-8 ohne BOM, Spalte „Email Address" + Merge-Felder FIRMA, ORT, PLZ, STRASSE, WEBSITE, TELEFON, HINWEIS.
//   node scripts/leads/mailchimp-export.cjs [Datum]   (Standard: 2026-09-22)
const fs = require("fs");
const path = require("path");
const datum = process.argv[2] || "2026-09-22";
const ORDNER = path.join(__dirname, "..", "..", "marketing", "Leads");
const quelle = path.join(ORDNER, `Email_Maler_BW_${datum}.csv`);
const ziel = path.join(ORDNER, `Mailchimp_Import_Maler_BW_${datum}.csv`);

function parseCsv(text, trenner) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const zeilen = []; let feld = "", zeile = [], inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) { if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQuote = false; } else feld += c; }
    else if (c === '"') inQuote = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; zeile.push(feld); feld = ""; if (zeile.length > 1 || zeile[0] !== "") zeilen.push(zeile); zeile = []; }
    else feld += c;
  }
  if (feld !== "" || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  const kopf = zeilen[0];
  return zeilen.slice(1).map((z) => Object.fromEntries(kopf.map((k, i) => [k, (z[i] ?? "").trim()])));
}
const q = (v) => { const s = String(v ?? ""); return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const zeilen = parseCsv(fs.readFileSync(quelle, "utf8"), ";");
const kopf = ["Email Address", "FIRMA", "ORT", "PLZ", "STRASSE", "WEBSITE", "TELEFON", "HINWEIS"];
const ausgabe = zeilen
  .filter((z) => z["E-Mail"])
  .map((z) => [z["E-Mail"], z.Firma, z.Ort, z.PLZ, z["Straße"], z.Website, z.Telefon, z.Hinweis]);
fs.writeFileSync(ziel, [kopf.join(","), ...ausgabe.map((z) => z.map(q).join(","))].join("\r\n") + "\r\n", "utf8");
console.log(`${ausgabe.length} Kontakte → ${ziel}`);
