// Cockpit — die aufgeräumte Startseite eines registrierten Betriebs.
//
// Erreichbar über /start/<einstellungenToken> (passwortlos, wie überall).
// Bündelt an einer Stelle: Kennzahlen, die Liste aller Angebote (durchsuchbar)
// und die Navigation zu Import und Einstellungen. Die Angebotsübersicht ist
// bewusst hierher gewandert (raus aus den Einstellungen), damit die
// Einstellungen schlank bleiben und man oben zwischen den Bereichen wechselt.
//
// Selbsttragend: eingebettetes CSS/JS, kein Framework.
import type { Handwerker } from "@prisma/client";
import { bearbeitenLink } from "./tokens.js";
import { navLeiste, navStyles, topBar } from "./navigation.js";
import type { DokUebersicht } from "./einstellungenSeite.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export interface Kennzahlen {
  anzahl: number;
  offen: number; // Angebote mit offenen Preisen
  volumen: number; // Summe der vollständigen Brutto-Beträge
}

export function cockpitSeite(args: {
  handwerker: Handwerker;
  logoDataUrl: string | null;
  akzent: string;
  dokumente: DokUebersicht[];
  kennzahlen: Kennzahlen;
  token: string;
}): string {
  const { handwerker: h, logoDataUrl, akzent, dokumente, kennzahlen, token } = args;

  const zeilen =
    dokumente.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:26px;">Noch keine Angebote. Diktieren Sie eine Sprachnachricht oder importieren Sie ein altes Angebot.</td></tr>`
      : dokumente
          .map(
            (d) => `<tr data-such="${escapeHtml((d.nummer + " " + (d.kundeName ?? "")).toLowerCase())}">
        <td class="c-num" data-label="Nummer"><a href="${bearbeitenLink(d.bearbeitenToken)}">${escapeHtml(d.nummer)}</a>${d.version > 1 ? ` <span class="fassung">Fassung ${d.version}</span>` : ""}</td>
        <td data-label="Art">${d.art === "ANGEBOT" ? "Angebot" : "Protokoll"}</td>
        <td data-label="Kunde">${escapeHtml(d.kundeName ?? "—")}</td>
        <td data-label="Datum">${datumDE(d.datum)}</td>
        <td class="r" data-label="Betrag">${d.vollstaendig ? euro(d.brutto) : '<span class="offen">offen</span>'}</td>
      </tr>`,
          )
          .join("");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Übersicht — AuftragsBoss</title>
<style>
  :root { --akzent: ${akzent}; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#eef0f3; color:#1a1a1a; line-height:1.5; }
  .rahmen { max-width:1000px; margin:0 auto; padding:16px; }
  ${navStyles()}
  .kennzahlen { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:16px; }
  .kz { background:#fff; border-radius:12px; padding:16px 18px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .kz .wert { font-size:26px; font-weight:800; color:var(--akzent); }
  .kz .titel { font-size:13px; color:#667; margin-top:2px; }
  .karte { background:#fff; border-radius:12px; padding:20px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .karte h2 { font-size:16px; margin:0 0 14px; }
  .suche { width:100%; padding:10px 12px; border:1px solid #cfd4da; border-radius:8px; font-size:15px; margin-bottom:12px; }
  .suche:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
  table { width:100%; border-collapse:collapse; }
  th { background:var(--akzent); color:#fff; font-size:12px; text-align:left; padding:9px 8px; font-weight:600; }
  th.r, td.r { text-align:right; }
  td { padding:11px 8px; border-bottom:1px solid #eceff2; font-size:14px; }
  td a { color:var(--akzent); font-weight:700; text-decoration:none; }
  td a:hover { text-decoration:underline; }
  .fassung { color:#888; font-size:12px; }
  .offen { color:#b7791f; font-weight:600; }
  .leer-such { text-align:center; color:#999; padding:20px; display:none; }
  @media (max-width:720px){
    .kennzahlen{ grid-template-columns:1fr; }
    thead{ display:none; }
    tbody tr{ display:block; border:1px solid #e3e7ea; border-radius:9px; padding:6px 12px 8px; margin-bottom:10px; }
    tbody td[data-label]{ display:flex; justify-content:space-between; gap:12px; border:none; padding:5px 0; text-align:right; }
    tbody td[data-label]::before{ content:attr(data-label); color:#777; font-size:12px; font-weight:600; text-align:left; }
    tbody td.c-num{ border-bottom:1px solid #eef1f3; padding-bottom:6px; margin-bottom:2px; font-size:15px; }
  }
</style>
</head>
<body>
<div class="rahmen">
  ${topBar(h, logoDataUrl)}

  ${navLeiste(token, "start")}

  <div class="kennzahlen">
    <div class="kz"><div class="wert">${kennzahlen.anzahl}</div><div class="titel">Angebote gesamt</div></div>
    <div class="kz"><div class="wert">${kennzahlen.offen}</div><div class="titel">mit offenen Preisen</div></div>
    <div class="kz"><div class="wert">${euro(kennzahlen.volumen)}</div><div class="titel">Volumen (fertige Angebote)</div></div>
  </div>

  <div class="karte">
    <h2>Ihre Angebote</h2>
    <input class="suche" id="suche" type="search" placeholder="Suchen nach Nummer oder Kunde …">
    <div class="tab-scroll">
      <table>
        <thead><tr><th>Nummer</th><th>Art</th><th>Kunde</th><th>Datum</th><th class="r">Betrag</th></tr></thead>
        <tbody id="liste">${zeilen}</tbody>
      </table>
    </div>
    <div class="leer-such" id="leerSuch">Keine Angebote gefunden.</div>
  </div>
</div>

<script>
const suche = document.getElementById("suche");
if (suche) suche.addEventListener("input", () => {
  const q = suche.value.trim().toLowerCase();
  let sichtbar = 0;
  for (const tr of document.querySelectorAll("#liste tr[data-such]")) {
    const treffer = !q || tr.getAttribute("data-such").includes(q);
    tr.style.display = treffer ? "" : "none";
    if (treffer) sichtbar++;
  }
  document.getElementById("leerSuch").style.display = sichtbar === 0 ? "block" : "none";
});
</script>
</body>
</html>`;
}
