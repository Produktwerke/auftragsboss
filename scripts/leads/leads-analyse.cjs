// Lead-Auswertung 22.09.2026: Vergleich Claude- vs. ChatGPT-Bewertung, Ausschluss der
// SalesFrank-A-Liste, zwei neue Listen (Dialogpost mit Adresse, E-Mail-Kandidaten mit Website).
// Nur lesend auf die CSV-Exporte; schreibt nach marketing/Leads/ (gitignored).
const fs = require("fs");
const path = require("path");

const ORDNER = "C:/dev/dag/auftragsboss/marketing/Leads";
const CSV = path.join(ORDNER, "csv");

// ── CSV-Parser (Trenner ;, Anführungszeichen "", Zeilenumbrüche in Feldern, BOM) ──
function parseCsv(text, trenner) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const zeilen = [];
  let feld = "", zeile = [], inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; } else inQuote = false;
      } else feld += c;
    } else if (c === '"') inQuote = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.length > 1 || zeile[0] !== "") zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  if (feld !== "" || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  const kopf = zeilen[0];
  return zeilen.slice(1).map((z) => Object.fromEntries(kopf.map((k, i) => [k, (z[i] ?? "").trim()])));
}
function lade(name, trenner) {
  const p = path.join(CSV, name);
  return parseCsv(fs.readFileSync(p, "utf8"), trenner);
}
const telDigits = (s) => {
  let d = String(s || "").replace(/\D/g, "");
  if (d.startsWith("0049")) d = d.slice(2);
  else if (d.startsWith("0")) d = "49" + d.slice(1);
  return d;
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const zahl = (s) => { const v = parseFloat(String(s || "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
const schluessel = (tel, name, plz) => (telDigits(tel) ? "T" + telDigits(tel) : "N" + norm(name) + "|" + String(plz || "").trim());

// ── Daten laden ──
const original = lade("original.csv", ";");
const claude = lade("claude-priorisiert.csv", ";");
const chatgpt = lade("chatgpt-priorisiert.csv", ";");
const salesA = parseCsv(fs.readFileSync(path.join(ORDNER, "SalesFrank_Import_A_Telefon_2026-09-17.csv"), "utf8"), ",");
const claudeA = lade("claude-A.csv", ";");

console.log(`Original ${original.length} · Claude ${claude.length} · ChatGPT ${chatgpt.length} · SalesFrank A ${salesA.length} · Claude-Blatt A ${claudeA.length}`);

const origByKey = new Map();
for (const o of original) origByKey.set(schluessel(o.phone, o.name, o.postal_code), o);
const gptByKey = new Map();
for (const g of chatgpt) gptByKey.set(schluessel(g.phone, g.name, g.postal_code), g);

// ── Sperrliste: SalesFrank A (Telefon) + Claude-Blatt A (zur Sicherheit auch Name+PLZ) ──
const gesperrt = new Set();
for (const s of salesA) { gesperrt.add("T" + telDigits(s.phone_number)); gesperrt.add("N" + norm(s.firma || s.company_name) + "|" + String(s.plz || "").trim()); }
for (const a of claudeA) { gesperrt.add(schluessel(a.Telefon, a.Firma, a.PLZ)); gesperrt.add("N" + norm(a.Firma) + "|" + a.PLZ); }
const istGesperrt = (r) => gesperrt.has(schluessel(r.Telefon, r.Firma, r.PLZ)) || gesperrt.has("N" + norm(r.Firma) + "|" + r.PLZ) || gesperrt.has("T" + telDigits(r.Telefon));
// Kontrolle: alle 250 SalesFrank-Nummern müssen in Claude wiedergefunden werden
const claudeByKey = new Map(claude.map((r) => [schluessel(r.Telefon, r.Firma, r.PLZ), r]));
let aGefunden = 0;
for (const s of salesA) if (claudeByKey.has("T" + telDigits(s.phone_number))) aGefunden++;
console.log(`SalesFrank-A-Nummern in der Claude-Liste wiedergefunden: ${aGefunden}/${salesA.length}`);

// ── Vergleich der Bewertungen ──
const PORTALE = /(11880|gelbeseiten|dasoertliche|das-oertliche|facebook|instagram|maler\.org|malerbetrieb\.org|myhammer|blauarbeit|houzz|yelp|wlw\.de|cylex|firmenwissen|golocal|meinestadt|branchenbuch|handwerker-|werkzeug|jimdosite|business\.site|google\.|goo\.gl)/i;
const verglichen = [];
for (const c of claude) {
  const g = gptByKey.get(schluessel(c.Telefon, c.Firma, c.PLZ));
  if (g) verglichen.push({ c, g, rc: +c.Rang, rg: +g.Rang });
}
const top = (n, sel) => new Set(verglichen.filter((v) => sel(v) <= n).map((v) => schluessel(v.c.Telefon, v.c.Firma, v.c.PLZ)));
const ueberlappung = (n) => { const a = top(n, (v) => v.rc), b = top(n, (v) => v.rg); let k = 0; for (const x of a) if (b.has(x)) k++; return k; };
// Spearman über die gemeinsamen Zeilen
const nV = verglichen.length;
let d2 = 0; for (const v of verglichen) d2 += (v.rc - v.rg) ** 2;
const spearman = 1 - (6 * d2) / (nV * (nV * nV - 1));
const gptPrio = {}; for (const g of chatgpt) gptPrio[g["Priorität"]] = (gptPrio[g["Priorität"]] || 0) + 1;
let aInGptTop250 = 0, aInGptPrioA = 0;
for (const s of salesA) { const g = gptByKey.get("T" + telDigits(s.phone_number)); if (g) { if (+g.Rang <= 250) aInGptTop250++; if (g["Priorität"] === "A") aInGptPrioA++; } }
const starkAbweichend = verglichen.filter((v) => Math.abs(v.rc - v.rg) > 1500).sort((a, b) => Math.abs(b.rc - b.rg) - Math.abs(a.rc - a.rg)).slice(0, 8);

// ── Baden-Württemberg über die PLZ (Outscraper-Spalte state ist leer; Suche lieferte auch Nachbarländer) ──
function istBW(plz) {
  const p = String(plz || "").trim(); if (!/^\d{5}$/.test(p)) return false;
  const n = +p;
  if (n >= 70000 && n <= 75999) return true;
  if (n >= 77000 && n <= 79999) return true;
  if (n >= 76000 && n <= 76999) return !(n >= 76700 && n <= 76899); // 767xx/768xx = Rheinland-Pfalz (Germersheim, Landau, Wörth)
  if (n >= 68000 && n <= 69999) return !(n >= 68510 && n <= 68649) && n !== 69434 && n !== 69239; // Viernheim/Lampertheim/Bürstadt, Hirschhorn, Neckarsteinach = Hessen
  if (n >= 88000 && n <= 88999) return !(n >= 88130 && n <= 88179); // Lindau-Ecke = Bayern
  if (n >= 89000 && n <= 89999) return (n <= 89198) || (n >= 89500 && n <= 89699); // 892xx–894xx = Bayern (Neu-Ulm, Günzburg, Dillingen)
  if (n >= 97877 && n <= 97999) return [97877, 97896, 97900, 97922].includes(n) || n >= 97941; // Main-Tauber-Kreis
  return false;
}

// ── Kandidaten für die neuen Listen ──
const phoneAbzug = (r) => (r.Handy === "ja" ? 40 : telDigits(r.Telefon) ? 10 : 0);
const kandidaten = [];
let nichtBW = 0;
for (const c of claude) {
  const score = zahl(c.Score) ?? -999;
  if (score < 0) continue; // geschlossen oder Dublette
  if (istGesperrt(c)) continue;
  if (!istBW(c.PLZ)) { nichtBW++; continue; }
  const o = origByKey.get(schluessel(c.Telefon, c.Firma, c.PLZ)) || {};
  if (o.business_status && o.business_status !== "OPERATIONAL") continue;
  if (!/(maler|painter|stuckateur|gipser|trockenbau|lackier|raumaus|renov)/i.test(`${c.Typ} ${c.Firma} ${o.type || ""} ${o.subtypes || ""}`)) continue;
  const g = gptByKey.get(schluessel(c.Telefon, c.Firma, c.PLZ));
  const fit = score - phoneAbzug(c); // Eignung ohne Telefon-Komponente
  const gptFit = g ? zahl(g["Fit-Score"]) : null;
  const adresseOk = /\d/.test(c["Straße"]) && /^\d{5}$/.test(c.PLZ) && c.Ort;
  const website = c.Website && !PORTALE.test(c.Website) ? c.Website : "";
  kandidaten.push({ c, o, g, fit, gptFit, adresseOk, website });
}
// Reihenfolge: Claude-Eignung ohne Telefon, bei Gleichstand ChatGPT-Fit, dann Claude-Rang
kandidaten.sort((a, b) => b.fit - a.fit || (b.gptFit ?? 0) - (a.gptFit ?? 0) || +a.c.Rang - +b.c.Rang);

// Abwechselnd verteilen, damit beide Listen gleich stark sind: Post braucht Adresse, E-Mail braucht Website.
const post = [], mail = [];
const POST_N = 250, MAIL_N = 400;
let naechste = "post";
for (const k of kandidaten) {
  if (post.length >= POST_N && mail.length >= MAIL_N) break;
  const kannPost = k.adresseOk && post.length < POST_N;
  const kannMail = !!k.website && mail.length < MAIL_N;
  if (naechste === "post" && kannPost) { post.push(k); naechste = "mail"; }
  else if (naechste === "mail" && kannMail) { mail.push(k); naechste = "post"; }
  else if (kannPost) { post.push(k); naechste = "mail"; }
  else if (kannMail) { mail.push(k); naechste = "post"; }
}

// ── Ausgabe ──
const q = (v) => { const s = String(v ?? ""); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function schreibeCsv(datei, kopf, zeilen) {
  const inhalt = "\ufeff" + [kopf.join(";"), ...zeilen.map((z) => z.map(q).join(";"))].join("\r\n") + "\r\n";
  fs.writeFileSync(path.join(ORDNER, datei), inhalt, "utf8");
}
schreibeCsv("Dialogpost_Maler_BW_2026-09-22.csv",
  ["Nr", "Firma", "Straße", "PLZ", "Ort", "Telefon", "Handy", "Website", "Bewertungen", "Note", "Gewerk", "Rang Claude", "Rang ChatGPT", "Eignung ohne Telefon"],
  post.map((k, i) => [i + 1, k.c.Firma, k.c["Straße"], k.c.PLZ, k.c.Ort, k.c.Telefon, k.c.Handy, k.c.Website, k.c.Bewertungen, k.c.Note, k.c.Typ, k.c.Rang, k.g ? k.g.Rang : "", k.fit]));
schreibeCsv("Email_Kandidaten_Maler_BW_2026-09-22.csv",
  ["Nr", "Firma", "E-Mail", "Website", "Straße", "PLZ", "Ort", "Telefon", "Handy", "Bewertungen", "Note", "Gewerk", "Rang Claude", "Rang ChatGPT", "Eignung ohne Telefon"],
  mail.map((k, i) => [i + 1, k.c.Firma, "", k.website, k.c["Straße"], k.c.PLZ, k.c.Ort, k.c.Telefon, k.c.Handy, k.c.Bewertungen, k.c.Note, k.c.Typ, k.c.Rang, k.g ? k.g.Rang : "", k.fit]));

// Kennzahlen für den Bericht
const mitWebsite = claude.filter((c) => c.Website && !PORTALE.test(c.Website)).length;
const mitAdresse = claude.filter((c) => /\d/.test(c["Straße"]) && /^\d{5}$/.test(c.PLZ)).length;
const emailsImOriginal = original.filter((o) => Object.values(o).some((v) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(v))).length;
const bericht = `# Lead-Auswertung 22.09.2026 (BW Maler, 3.000 Outscraper-Einträge)

## Datenlage
- Einträge: ${original.length}; mit eigener Website (ohne Portale): ${mitWebsite}; mit vollständiger Adresse: ${mitAdresse}.
- E-Mail-Adressen in den Outscraper-Daten: ${emailsImOriginal} (keine E-Mail-Spalte; „name_for_emails" ist nur der Firmenname in Anredeform).
- Gesperrt (SalesFrank A): ${salesA.length} Nummern, davon ${aGefunden} in der Claude-Liste wiedergefunden.

## Vergleich Claude- vs. ChatGPT-Bewertung
- Gemeinsam zuordenbare Zeilen: ${nV} von ${claude.length}.
- Überlappung Top 250: ${ueberlappung(250)} Betriebe · Top 500: ${ueberlappung(500)} · Top 1000: ${ueberlappung(1000)}.
- Rang-Korrelation (Spearman) über alle Zeilen: ${spearman.toFixed(2)} (1 = identische Reihenfolge, 0 = kein Zusammenhang).
- ChatGPT-Prioritäten: ${Object.entries(gptPrio).map(([k, v]) => `${k || "leer"}: ${v}`).join(", ")}.
- SalesFrank-A-Liste bei ChatGPT: ${aInGptTop250} von 250 in den Top 250, ${aInGptPrioA} mit Priorität A.
- Größte Abweichungen (Rang Claude / Rang ChatGPT):
${starkAbweichend.map((v) => `  - ${v.c.Firma} (${v.c.Ort}): ${v.rc} / ${v.rg}. Claude: ${v.c["Begründung"].slice(0, 90)}. ChatGPT: ${v.g["Begründung"].slice(0, 90)}`).join("\n")}

## Neue Listen (ohne A-Liste, ohne geschlossene Betriebe und Dubletten, nur Maler und Nachbargewerke, nur Baden-Württemberg)
- Kandidaten gesamt: ${kandidaten.length}; ausgeschlossen, weil PLZ außerhalb Baden-Württembergs (Nachbarländer aus der Google-Suche): ${nichtBW}.
- Reihenfolge nach Claude-Score OHNE Telefon-Komponente (Handy +40 / Festnetz +10 abgezogen), Gleichstand nach ChatGPT-Fit.
- Abwechselnd verteilt, damit beide Listen gleich stark sind; Post braucht Straße+PLZ+Ort, E-Mail braucht eigene Website.
- Dialogpost: ${post.length} Betriebe, davon ${post.filter((k) => k.c.Handy === "ja").length} mit Handynummer.
- E-Mail-Kandidaten: ${mail.length} Betriebe mit Website (E-Mail-Spalte leer, wird über die Website ermittelt), davon ${mail.filter((k) => k.c.Handy === "ja").length} mit Handynummer.
- Überschneidung beider Listen: 0 (bewusst getrennt).
`;
fs.writeFileSync(path.join(ORDNER, "Lead-Auswertung_2026-09-22.md"), bericht, "utf8");
console.log(bericht);
