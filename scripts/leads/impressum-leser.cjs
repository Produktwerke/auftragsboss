// Impressum-Leser 22.09.2026: liest für die E-Mail-Kandidaten (Maler BW) die Kontaktadresse
// von der Website (Startseite, dann Impressum/Kontakt). Höflich: höchstens 4 Seiten je Website,
// 10 Websites parallel, 12 s Zeitlimit je Seite. Schreibt zwei CSVs nach marketing/Leads/.
const fs = require("fs");
const path = require("path");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // alte Handwerker-Websites mit kaputtem Zertifikat trotzdem lesen (nur öffentliche Seiten)

const ORDNER = "C:/dev/dag/auftragsboss/marketing/Leads";
const EINGABE = path.join(ORDNER, "Email_Kandidaten_Maler_BW_2026-09-22.csv");
const AUSGABE_ALLE = path.join(ORDNER, "Email_Kandidaten_Maler_BW_2026-09-22_mit_Adressen.csv");
const AUSGABE_250 = path.join(ORDNER, "Email_Maler_BW_2026-09-22.csv");
const LOG = path.join(ORDNER, "csv", "impressum-leser.log");
const PARALLEL = 10, ZEITLIMIT_MS = 12000, MAX_SEITEN = 4, ZIEL = 250;

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
  return { kopf, zeilen: zeilen.slice(1).map((z) => Object.fromEntries(kopf.map((k, i) => [k, (z[i] ?? "").trim()]))) };
}
const q = (v) => { const s = String(v ?? ""); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const schreibeCsv = (datei, kopf, zeilen) => fs.writeFileSync(datei, "\ufeff" + [kopf.join(";"), ...zeilen.map((z) => z.map(q).join(";"))].join("\r\n") + "\r\n", "utf8");
const log = (s) => { const z = `${new Date().toISOString().slice(11, 19)} ${s}`; console.log(z); fs.appendFileSync(LOG, z + "\n"); };

// ── E-Mail-Erkennung ──
const DATEI_ENDUNGEN = /\.(png|jpe?g|gif|svg|webp|css|js|pdf|woff2?|ttf|ico|mp4)$/i;
const FREMDE_DOMAINS = /(sentry|wixpress|wix\.com|jimdo|squarespace|example\.|domain\.|mustermann|ionos|1und1|1and1|strato|hosteurope|all-inkl|alfahosting|df\.eu|google|facebook|instagram|cloudflare|w3\.org|schema\.org|adobe|fontawesome|typo3|wordpress|wpengine|elementor|godaddy|website-start|webnode|weebly|hubspot|mailchimp|cookiebot|usercentrics|borlabs|matomo|yourdomain|email\.de$|domain\.tld|my-?domain|firma\.de$|beispiel|schlicht|verbraucher|europa\.eu|ec\.europa|odr|handwerkskammer|hwk-|ihk|bundesnetzagentur|datenschutz|lda\.|bfdi|e-recht|erecht24|it-recht|kanzlei|anwalt|rechtsanwalt|agentur|webdesign|mediendesign|werbeagentur|pixel|creativ|kreativ|studio)/i;
// Zulässige Endungen; klebt Text ohne Leerzeichen an (info@firma.deMobil), wird auf die bekannte Endung gekürzt
const ENDUNGEN = ["de", "com", "net", "org", "eu", "info", "at", "ch", "biz", "io", "me", "online", "shop", "digital", "design", "berlin", "bayern", "koeln", "hamburg", "nrw", "saarland", "ruhr", "tirol", "wien", "pro", "email", "cloud", "site", "website", "team", "haus", "immo", "bau", "app", "li", "lu", "fr", "it", "nl", "pl", "tr", "hr", "rs", "ba", "al", "xyz", "co"];
// Bilddateinamen wie „banner-office@2x.webp" sind keine Adressen
const BILD_MUSTER = /@[0-9]x\.|(background|banner|icon|logo|sprite|image|placeholder|thumb|retina)/i;
function kuerzeEndung(email) {
  const at = email.lastIndexOf("@"); if (at < 0) return email;
  const domain = email.slice(at + 1); const teile = domain.split("."); const tld = teile[teile.length - 1];
  if (ENDUNGEN.includes(tld)) return email;
  const bekannt = ENDUNGEN.filter((e) => tld.startsWith(e)).sort((a, b) => b.length - a.length)[0];
  if (!bekannt) return "";
  teile[teile.length - 1] = bekannt; return email.slice(0, at + 1) + teile.join(".");
}
const SCHWACHE_LOKALTEILE = /^(noreply|no-reply|nobody|datenschutz|privacy|dsb|webmaster|hostmaster|postmaster|abuse|bewerbung|jobs?|karriere|presse|newsletter|spam|test|admin|support|service@)/i;
const GUTE_LOKALTEILE = /^(info|kontakt|contact|mail|office|post|buero|büro|zentrale|anfrage|hallo|hello|malerei|maler|team|willkommen|service)$/i;

function entschluesselCloudflare(hex) {
  try { const k = parseInt(hex.slice(0, 2), 16); let s = ""; for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return s; } catch { return ""; }
}
function entschleiere(html) {
  let t = html
    .replace(/data-cfemail="([0-9a-f]+)"/gi, (_, h) => ` ${entschluesselCloudflare(h)} `)
    .replace(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi, (_, h) => ` ${entschluesselCloudflare(h)} `)
    .replace(/&#0*64;|&#x0*40;|&commat;|\\u0040|%40/gi, "@")
    .replace(/&#0*46;|&#x0*2e;|&period;|\\u002e/gi, ".")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/<\s*\/?\s*(span|b|i|strong|em|u|wbr)[^>]*>/gi, "") // Trennungen in Spans zusammenziehen
    .replace(/<[^>]+>/g, " ");
  // Verschleierungen: info (at) firma (dot) de, info [at] firma.de, info AT firma DOT de, info@firma[.]de
  t = t.replace(/([a-z0-9._%+-]{1,64})\s*[\(\[\{]\s*(?:at|ät|@)\s*[\)\]\}]\s*([a-z0-9-]+(?:\s*[\(\[\{]?\s*(?:dot|punkt|\.)\s*[\)\]\}]?\s*[a-z0-9-]+)+)/gi,
    (_, l, d) => `${l}@${d.replace(/\s*[\(\[\{]?\s*(?:dot|punkt)\s*[\)\]\}]?\s*/gi, ".").replace(/\s+/g, "")}`);
  t = t.replace(/([a-z0-9._%+-]{1,64})\s+(?:at|ät)\s+([a-z0-9-]+(?:\s*(?:dot|punkt)\s*[a-z0-9-]+)+)/gi,
    (_, l, d) => `${l}@${d.replace(/\s*(?:dot|punkt)\s*/gi, ".").replace(/\s+/g, "")}`);
  return t;
}
function findeAdressen(html) {
  const t = entschleiere(html);
  const treffer = new Set();
  for (const m of t.matchAll(/mailto:([^"'?\s<>]+)/gi)) treffer.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of t.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/gi)) treffer.add(m[0].toLowerCase());
  return [...new Set([...treffer]
    .map((e) => e.replace(/^[.\-_]+/, "").replace(/[.\-_]+$/, ""))
    .filter((e) => !DATEI_ENDUNGEN.test(e) && !BILD_MUSTER.test(e) && !/\.(png|jpg|gif|svg|webp)@/i.test(e))
    .map(kuerzeEndung))]
    .filter((e) => e && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,10}$/.test(e));
}
const FREIMAIL = /(gmail|googlemail|t-online|web\.de|gmx|yahoo|outlook|hotmail|icloud|freenet|posteo|mail\.de|arcor|aol|kabelmail|online\.de|vodafone|magenta|unitybox|o2online|1und1\.de|kabelbw)/i;
const hauptDomain = (host) => { const p = host.toLowerCase().replace(/^www\./, "").split("."); return p.slice(-2).join("."); };
function bewerte(email, siteHost, ursprungHost) {
  const [lokal, domain] = email.split("@");
  let p = 0;
  if (hauptDomain(domain) === hauptDomain(siteHost) || (ursprungHost && hauptDomain(domain) === hauptDomain(ursprungHost))) p += 100;
  else if (FREMDE_DOMAINS.test(domain)) p -= 200;
  else if (FREIMAIL.test(domain)) p += 30; // Freimail des Betriebs, plausibel
  if (GUTE_LOKALTEILE.test(lokal)) p += 20;
  if (SCHWACHE_LOKALTEILE.test(lokal)) p -= 50;
  if (/(maler|stuck|farbe|raum|lack|bau|handwerk|meister)/i.test(domain)) p += 5;
  return p;
}

// ── Seiten laden ──
async function lade(url) {
  const r = await fetch(url, {
    redirect: "follow", signal: AbortSignal.timeout(ZEITLIMIT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36", Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "de-DE,de;q=0.9" },
  });
  const typ = r.headers.get("content-type") || "";
  if (!/html|xml|text/i.test(typ) && typ) return { url: r.url, html: "" };
  const puffer = await r.arrayBuffer();
  const html = Buffer.from(puffer.slice(0, 1_500_000)).toString("utf8");
  return { url: r.url, html };
}
function unterseiten(html, basis) {
  const gefunden = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].trim(), text = m[2].replace(/<[^>]+>/g, " ");
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u; try { u = new URL(href, basis); } catch { continue; }
    if (u.host.replace(/^www\./, "") !== new URL(basis).host.replace(/^www\./, "")) continue;
    const s = `${u.pathname} ${text}`;
    let prio = 0;
    if (/impressum|imprint/i.test(s)) prio = 4; else if (/kontakt|contact/i.test(s)) prio = 3; else if (/rechtlich|legal|anbieterkennzeichnung/i.test(s)) prio = 2; else if (/datenschutz|privacy|ueber-uns|über uns|unternehmen/i.test(s)) prio = 1;
    if (prio) { u.hash = ""; const k = u.href; if (!gefunden.has(k) || gefunden.get(k) < prio) gefunden.set(k, prio); }
  }
  return [...gefunden.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}
function normalisiereWebsite(w) {
  let s = String(w || "").trim().replace(/%23.*$/, "").replace(/#.*$/, "");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); u.hash = ""; return u.href; } catch { return ""; }
}
async function sucheAdresse(website) {
  const start = normalisiereWebsite(website);
  if (!start) return { status: "keine gültige Website" };
  const versuche = [start, start.replace(/^https:/, "http:")];
  let startseite = null, fehler = "";
  for (const v of versuche) { try { startseite = await lade(v); break; } catch (e) { fehler = e.name === "TimeoutError" ? "Zeitüberschreitung" : (e.cause?.code || e.message || String(e)).slice(0, 60); } }
  if (!startseite) return { status: `nicht erreichbar (${fehler})` };
  const host = new URL(startseite.url).host;
  const kandidaten = new Map(); // email -> {punkte, quelle}
  const merke = (html, quelle) => { for (const e of findeAdressen(html)) { const p = bewerte(e, host, new URL(start).host); if (!kandidaten.has(e) || kandidaten.get(e).punkte < p) kandidaten.set(e, { punkte: p, quelle }); } };
  merke(startseite.html, startseite.url);
  const beste = () => [...kandidaten.entries()].sort((a, b) => b[1].punkte - a[1].punkte)[0];
  let seiten = 1;
  if (!(beste() && beste()[1].punkte >= 100)) {
    const links = unterseiten(startseite.html, startseite.url);
    const ersatz = ["impressum", "impressum.html", "kontakt", "kontakt.html", "impressum.php", "impressum/", "kontakt/"].map((p) => new URL(p, startseite.url).href).filter((u) => !links.includes(u));
    const gesehen = new Set([startseite.url]);
    for (const u of [...links, ...ersatz]) {
      if (seiten >= MAX_SEITEN + 2) break;
      if (gesehen.has(u)) continue; gesehen.add(u);
      seiten++;
      try { const s = await lade(u); merke(s.html, s.url); } catch { /* Unterseite nicht erreichbar */ }
      const b = beste(); if (b && b[1].punkte >= 100) break;
    }
  }
  const b = beste();
  if (!b || b[1].punkte < 0) return { status: kandidaten.size ? "nur fremde Adressen" : "keine Adresse gefunden", seiten, alle: [...kandidaten.keys()].join(" ") };
  const emailDomain = b[0].split("@")[1];
  const ursprungHost = new URL(start).host; // Website laut Liste (vor Weiterleitung)
  const passt = hauptDomain(emailDomain) === hauptDomain(host) || hauptDomain(emailDomain) === hauptDomain(ursprungHost);
  const hinweis = passt ? "" : FREIMAIL.test(emailDomain) ? "Freimail-Adresse" : "Domain weicht von der Website ab, bitte kurz prüfen";
  return { status: "gefunden", email: b[0], quelle: b[1].quelle, punkte: b[1].punkte, seiten, hinweis, alle: [...kandidaten.keys()].join(" ") };
}

// ── Ablauf ──
(async () => {
  fs.writeFileSync(LOG, "");
  const { zeilen } = parseCsv(fs.readFileSync(EINGABE, "utf8"), ";");
  log(`Start: ${zeilen.length} Kandidaten, ${PARALLEL} parallel`);
  const ergebnisse = new Array(zeilen.length);
  let naechster = 0, fertig = 0;
  async function arbeiter() {
    while (naechster < zeilen.length) {
      const i = naechster++;
      const z = zeilen[i];
      try { ergebnisse[i] = await sucheAdresse(z.Website); } catch (e) { ergebnisse[i] = { status: `Fehler: ${String(e.message || e).slice(0, 60)}` }; }
      fertig++;
      const r = ergebnisse[i];
      log(`${String(fertig).padStart(3)}/${zeilen.length} ${z.Firma.slice(0, 40).padEnd(40)} ${r.status}${r.email ? " " + r.email : ""}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));

  const kopfAlle = ["Nr", "Firma", "E-Mail", "Status", "Fundstelle", "Weitere Adressen", "Website", "Straße", "PLZ", "Ort", "Telefon", "Handy", "Bewertungen", "Note", "Gewerk", "Rang Claude", "Rang ChatGPT", "Eignung ohne Telefon"];
  schreibeCsv(AUSGABE_ALLE, kopfAlle, zeilen.map((z, i) => { const r = ergebnisse[i] || {}; return [z.Nr, z.Firma, r.email || "", r.status || "", r.quelle || "", r.alle || "", z.Website, z["Straße"], z.PLZ, z.Ort, z.Telefon, z.Handy, z.Bewertungen, z.Note, z.Gewerk, z["Rang Claude"], z["Rang ChatGPT"], z["Eignung ohne Telefon"]]; }));
  const mitAdresse = zeilen.map((z, i) => ({ z, r: ergebnisse[i] })).filter((x) => x.r && x.r.email);
  const gesehen = new Set(); const endliste = [];
  for (const x of mitAdresse) { if (gesehen.has(x.r.email)) continue; gesehen.add(x.r.email); endliste.push(x); if (endliste.length >= ZIEL) break; }
  const kopf250 = ["Nr", "Firma", "E-Mail", "Hinweis", "Website", "Straße", "PLZ", "Ort", "Telefon", "Handy", "Bewertungen", "Note", "Gewerk", "Fundstelle", "Rang Claude", "Rang ChatGPT"];
  schreibeCsv(AUSGABE_250, kopf250, endliste.map((x, i) => [i + 1, x.z.Firma, x.r.email, x.r.hinweis || "", x.z.Website, x.z["Straße"], x.z.PLZ, x.z.Ort, x.z.Telefon, x.z.Handy, x.z.Bewertungen, x.z.Note, x.z.Gewerk, x.r.quelle, x.z["Rang Claude"], x.z["Rang ChatGPT"]]));

  const zaehl = {}; for (const r of ergebnisse) { const k = (r?.status || "?").replace(/\(.*$/, "").trim(); zaehl[k] = (zaehl[k] || 0) + 1; }
  const eigene = mitAdresse.filter((x) => x.r.punkte >= 100).length;
  log(`FERTIG. Gefunden: ${mitAdresse.length} von ${zeilen.length} (davon ${eigene} auf eigener Domain, ${mitAdresse.length - eigene} Freimail o. ä.); Endliste: ${endliste.length}.`);
  log(`Status: ${Object.entries(zaehl).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
})();
