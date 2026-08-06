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
import { empfehlungsText } from "../empfehlung.js";
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
  werbeUrl: string;
}): string {
  const { handwerker: h, logoDataUrl, akzent, dokumente, kennzahlen, token, werbeUrl } = args;
  const teilenText = empfehlungsText(h.firma || "Ein Kollege", werbeUrl);
  const waHref = `https://wa.me/?text=${encodeURIComponent(teilenText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("Empfehlung: AuftragsBoss")}&body=${encodeURIComponent(teilenText)}`;

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
  .werbe-hint { color:#667; font-size:13px; margin:0 0 12px; }
  .link-zeile { display:flex; gap:8px; margin-bottom:12px; }
  .link-zeile input { flex:1; padding:9px 11px; border:1px solid #cfd4da; border-radius:8px; font-size:14px; background:#f7f9fb; color:#333; }
  .werbe-btns { display:flex; gap:8px; flex-wrap:wrap; }
  .tbtn { text-decoration:none; border:none; border-radius:8px; padding:9px 14px; font-size:14px; font-weight:600; cursor:pointer; }
  .tbtn.wa { background:#25D366; color:#fff; }
  .tbtn.mail { background:#e7eaef; color:#333; }
  .tbtn.copy { background:#e7eaef; color:#333; }
  .werbe-form { margin-top:16px; padding-top:14px; border-top:1px solid #eef1f3; }
  .werbe-form h3 { font-size:14px; margin:0 0 8px; }
  .werbe-form .reihe { display:flex; gap:8px; flex-wrap:wrap; }
  .werbe-form input { flex:1; min-width:150px; padding:9px 11px; border:1px solid #cfd4da; border-radius:8px; font-size:14px; }
  .werbe-form button { background:var(--akzent); color:#fff; border:none; border-radius:8px; padding:9px 16px; font-weight:600; cursor:pointer; }
  .werbe-status { font-size:13px; margin-top:8px; }
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

  <div class="karte">
    <h2>Kollegen empfehlen</h2>
    <p class="werbe-hint">Empfehle AuftragsBoss weiter &mdash; <strong>ihr bekommt beide 1 Monat gratis</strong>. Teile deinen persönlichen Link (kommt dann von dir) oder lass uns eine Einladung per E-Mail schicken.</p>
    <div class="link-zeile">
      <input id="werbeUrl" type="text" readonly value="${escapeHtml(werbeUrl)}">
    </div>
    <div class="werbe-btns">
      <a class="tbtn wa" href="${escapeHtml(waHref)}" target="_blank" rel="noopener">Per WhatsApp teilen</a>
      <a class="tbtn mail" href="${escapeHtml(mailHref)}">Per E-Mail teilen</a>
      <button class="tbtn copy" onclick="linkKopieren()">Link kopieren</button>
    </div>
    <div class="werbe-form">
      <h3>Oder: Kollege per E-Mail einladen</h3>
      <div class="reihe">
        <input id="wName" type="text" placeholder="Name des Kollegen">
        <input id="wEmail" type="email" placeholder="E-Mail-Adresse">
        <button onclick="perMailEinladen()">Einladen</button>
      </div>
      <div class="werbe-status" id="werbeStatus"></div>
    </div>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
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

function setWerbeStatus(text, farbe){ const s=document.getElementById("werbeStatus"); s.textContent=text; s.style.color=farbe; }

async function linkKopieren(){
  const inp=document.getElementById("werbeUrl");
  try{ await navigator.clipboard.writeText(inp.value); setWerbeStatus("✓ Link kopiert","#2e7d32"); }
  catch(e){ inp.select(); document.execCommand("copy"); setWerbeStatus("✓ Link kopiert","#2e7d32"); }
}

async function perMailEinladen(){
  const name=document.getElementById("wName").value.trim();
  const email=document.getElementById("wEmail").value.trim();
  if(name.length<2 || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ setWerbeStatus("Bitte Name und gültige E-Mail eingeben.","#b7791f"); return; }
  setWerbeStatus("Wird gesendet …","#667");
  try{
    const r=await fetch("/api/empfehlung/"+TOKEN+"/email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email})});
    const j=await r.json();
    if(!r.ok){ setWerbeStatus("Fehler: "+(j.fehler||r.status),"#c0261a"); return; }
    document.getElementById("wName").value=""; document.getElementById("wEmail").value="";
    setWerbeStatus("✓ Einladung an "+email+" gesendet.","#2e7d32");
  }catch(e){ setWerbeStatus("Netzwerkfehler: "+e,"#c0261a"); }
}
</script>
</body>
</html>`;
}
