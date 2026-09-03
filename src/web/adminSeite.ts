// Interne Lern-Ansicht (nur über den geheimen Admin-Link erreichbar).
//
// Stellt gegenüber, was die KI ANFANGS erkannt hat (kiOriginalJson) und was
// der Handwerker im Editor DARAUS gemacht hat. So sieht das Team auf einen
// Blick, wo die KI oft danebenliegt — die Grundlage zum Nachschärfen.
//
// Datensparsam: gezeigt werden NUR die Positionen (KI-Original vs. final),
// keine Kundennamen, Anschriften oder Anschreiben-Freitexte. Zugang bleibt
// dennoch streng auf den geheimen Admin-Link beschränkt.
import type { Dokument } from "@prisma/client";

interface Pos {
  kategorie: string;
  beschreibung: string;
  menge: number | null;
  einheit: string | null;
  einzelpreis: number | null;
}
interface Snapshot {
  positionen: Pos[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function posZeile(p: Pos): string {
  // Die Werte kommen aus gespeichertem JSON und sind NICHT vertrauenswürdig
  // typisiert (Altbestand/Fremdeingaben können Strings statt Zahlen sein).
  // Deshalb: immer erst zu String machen, dann escapen — nie roh ins HTML.
  const zahl = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? w.toLocaleString("de-DE") : escapeHtml(String(w)));
  const menge = p.menge != null ? ` · ${zahl(p.menge)} ${escapeHtml(String(p.einheit ?? ""))}`.trimEnd() : "";
  const preis = p.einzelpreis != null ? ` · ${zahl(p.einzelpreis)} €` : ' · <span class="leer">Preis offen</span>';
  return `<li><span class="kat">${p.kategorie === "MATERIAL" ? "M" : p.kategorie === "LEISTUNG" ? "A" : "+"}</span> ${escapeHtml(String(p.beschreibung ?? ""))}${menge}${preis}</li>`;
}

function posListe(positionen: Pos[]): string {
  if (!positionen.length) return `<p class="leer">—</p>`;
  return `<ul class="pos">${positionen.map(posZeile).join("")}</ul>`;
}

export function adminSeite(args: { dokumente: Dokument[]; basis?: string }): string {
  const eintraege = args.dokumente
    .map((d) => {
      const orig: Snapshot | null = d.kiOriginalJson ? (JSON.parse(d.kiOriginalJson) as Snapshot) : null;
      const finalPos = JSON.parse(d.positionenJson) as Pos[];
      const geaendert = orig ? JSON.stringify(orig.positionen) !== JSON.stringify(finalPos) : false;
      const origPreise = orig ? orig.positionen.filter((p) => p.einzelpreis != null).length : 0;
      const finalPreise = finalPos.filter((p) => p.einzelpreis != null).length;
      return { d, orig, finalPos, geaendert, origPreise, finalPreise };
    })
    .filter((e) => e.orig !== null);

  const bearbeitet = eintraege.filter((e) => e.geaendert).length;

  const karten = eintraege
    .map((e) => {
      const d = e.d;
      const orig = e.orig!;
      return `
    <div class="dok">
      <div class="dok-kopf">
        <div>
          <span class="nr">${escapeHtml(d.nummer)}${d.version > 1 ? ` <span class="fassung">Fassung ${d.version}</span>` : ""}</span>
          <span class="meta">${d.gewerk ? escapeHtml(d.gewerk) + " · " : ""}${datumDE(d.datum)}</span>
        </div>
        <span class="badge ${e.geaendert ? "b-edit" : "b-gleich"}">${e.geaendert ? "bearbeitet" : "unverändert"}</span>
      </div>
      <div class="spalten">
        <div class="spalte">
          <h4>KI-Original <span class="z">(${orig.positionen.length} Pos., ${e.origPreise} Preise)</span></h4>
          ${posListe(orig.positionen)}
        </div>
        <div class="spalte">
          <h4>Final (Handwerker) <span class="z">(${e.finalPos.length} Pos., ${e.finalPreise} Preise)</span></h4>
          ${posListe(e.finalPos)}
        </div>
      </div>
    </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AuftragsBoss · Lern-Auswertung</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#eef0f3; color:#1a1a1a; line-height:1.5; }
  .rahmen { max-width:1000px; margin:0 auto; padding:16px; }
  h1 { font-size:22px; margin:8px 2px 2px; }
  .unter { color:#666; font-size:14px; margin:0 2px 16px; }
  .kennz { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  .kachel { background:#fff; border-radius:10px; padding:14px 18px; box-shadow:0 1px 4px rgba(0,0,0,.07); flex:1; min-width:150px; }
  .kachel .wert { font-size:26px; font-weight:700; color:#0b5cad; }
  .kachel .lab { font-size:13px; color:#666; }
  .dok { background:#fff; border-radius:12px; padding:16px 18px; margin-bottom:14px; box-shadow:0 1px 4px rgba(0,0,0,.07); }
  .dok-kopf { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
  .nr { font-weight:700; color:#0b5cad; margin-right:8px; }
  .fassung { font-size:11px; color:#999; font-weight:400; }
  .meta { font-size:13px; color:#666; }
  .badge { font-size:12px; font-weight:600; padding:3px 9px; border-radius:20px; white-space:nowrap; }
  .b-edit { background:#fff3e0; color:#b7791f; }
  .b-gleich { background:#eef7ee; color:#2e7d32; }
  .spalten { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .spalte h4 { margin:0 0 6px; font-size:13px; color:#555; }
  .spalte h4 .z { font-weight:400; color:#999; }
  ul.pos { list-style:none; margin:0; padding:0; }
  ul.pos li { font-size:13px; padding:4px 0; border-bottom:1px solid #f0f2f4; }
  .kat { display:inline-block; width:16px; height:16px; line-height:16px; text-align:center; border-radius:4px; background:#eef0f3; color:#555; font-size:10px; font-weight:700; margin-right:5px; }
  .leer { color:#b0b6bc; }
  .hinweis { margin-top:10px; font-size:12px; color:#b7791f; }
  .keine { background:#fff; border-radius:12px; padding:30px; text-align:center; color:#777; }
  @media (max-width:640px){ .spalten { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="rahmen">
  <h1>Lern-Auswertung</h1>
  <p class="unter">KI-Original gegenüber dem, was der Handwerker daraus gemacht hat. Nur intern; ohne Kundennamen und Anschriften, nur Positionen.${args.basis ? ` <a href="${args.basis}/betriebe">Zum Betreiber-Cockpit (Kunden)</a>` : ""}</p>

  <div class="kennz">
    <div class="kachel"><div class="wert">${eintraege.length}</div><div class="lab">Angebote mit KI-Original</div></div>
    <div class="kachel"><div class="wert">${bearbeitet}</div><div class="lab">davon nachbearbeitet</div></div>
    <div class="kachel"><div class="wert">${eintraege.length ? Math.round((bearbeitet / eintraege.length) * 100) : 0}%</div><div class="lab">Bearbeitungsquote</div></div>
  </div>

  ${
    eintraege.length
      ? karten
      : `<div class="keine">Noch keine Angebote mit gespeichertem KI-Original.<br>Sobald neue Angebote entstehen, erscheinen sie hier.</div>`
  }
</div>
</body>
</html>`;
}
