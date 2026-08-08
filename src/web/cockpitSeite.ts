// Cockpit — die Übersichts-/Angebotsseite eines registrierten Betriebs.
//
// Erreichbar über /start/<einstellungenToken> (passwortlos, wie überall).
// Zentraler Arbeitsbereich: Begrüßung, ruhige KPI-Zeile, durchsuch- und
// filterbare Angebotstabelle, plus ein schlankes Empfehlungs-Panel. Nutzt die
// gemeinsame App-Shell (feste Sidebar + Topbar). Keine Kundenfarbe im Chrome.
import type { Handwerker } from "@prisma/client";
import { bearbeitenLink, importLink } from "./tokens.js";
import { appShell } from "./navigation.js";
import { empfehlungsText } from "../empfehlung.js";
import type { DokUebersicht } from "./einstellungenSeite.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const euroKurz = (n: number) =>
  n >= 10000 ? "€ " + Math.round(n / 1000) + "k" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function begruessung(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

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
  const { handwerker: h, logoDataUrl, dokumente, kennzahlen, token, werbeUrl } = args;
  const teilenText = empfehlungsText(h.firma || "Ein Kollege", werbeUrl);
  const waHref = `https://wa.me/?text=${encodeURIComponent(teilenText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("Empfehlung: AuftragsBoss")}&body=${encodeURIComponent(teilenText)}`;
  const versandbereit = Math.max(0, kennzahlen.anzahl - kennzahlen.offen);
  const anrede = h.name ? escapeHtml(h.name.split(" ")[0]) : escapeHtml(h.firma || "");

  const zeilen =
    dokumente.length === 0
      ? `<tr class="empty-row"><td colspan="5">Noch keine Angebote. Sprich eine WhatsApp-Nachricht ein oder importiere ein altes Angebot.</td></tr>`
      : dokumente
          .map((d) => {
            const status = d.vollstaendig
              ? `<span class="badge ok">Versandbereit</span>`
              : `<span class="badge warn">Offene Preise</span>`;
            const art = d.art === "ANGEBOT" ? "Angebot" : "Protokoll";
            return `<tr data-href="${escapeHtml(bearbeitenLink(d.bearbeitenToken))}" data-status="${d.vollstaendig ? "ok" : "warn"}" data-such="${escapeHtml((d.nummer + " " + (d.kundeName ?? "")).toLowerCase())}">
        <td class="t-num"><a href="${bearbeitenLink(d.bearbeitenToken)}">${escapeHtml(d.nummer)}</a>${d.version > 1 ? `<span class="t-sub">Fassung ${d.version}</span>` : ""}<div class="t-art">${art}</div></td>
        <td>${escapeHtml(d.kundeName ?? "—")}</td>
        <td>${status}</td>
        <td class="num">${datumDE(d.datum)}</td>
        <td class="r t-amount">${d.vollstaendig ? euro(d.brutto) : "—"}</td>
      </tr>`;
          })
          .join("");

  const content = `
      <div class="page-head">
        <div>
          <h1 class="greet">${begruessung()}${anrede ? ", " + anrede : ""}</h1>
          <p class="sub">Hier sind deine Angebote im Überblick.</p>
        </div>
        <a class="btn prim" href="${escapeHtml(importLink(token))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Angebot importieren
        </a>
      </div>

      <div class="stats">
        <div class="stat"><div class="k"><span class="dot"></span>Angebote gesamt</div><div class="v num">${kennzahlen.anzahl}</div><div class="m">alle Angebote &amp; Protokolle</div></div>
        <div class="stat"><div class="k"><span class="dot ok"></span>Versandbereit</div><div class="v num">${versandbereit}</div><div class="m">vollständig kalkuliert</div></div>
        <div class="stat"><div class="k"><span class="dot warn"></span>Mit offenen Preisen</div><div class="v num">${kennzahlen.offen}</div><div class="m">noch zu ergänzen</div></div>
        <div class="stat"><div class="k"><span class="dot"></span>Angebotsvolumen</div><div class="v num">${euroKurz(kennzahlen.volumen)}</div><div class="m">Summe fertiger Angebote</div></div>
      </div>

      <div class="panel" id="angebote">
        <div class="toolbar">
          <div class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            <input id="suche" type="search" placeholder="Angebote durchsuchen (Nummer oder Kunde) …">
          </div>
          <div class="seg" role="tablist">
            <button class="on" data-f="alle">Alle</button>
            <button data-f="ok">Versandbereit</button>
            <button data-f="warn">Offene Preise</button>
          </div>
        </div>
        <div class="dtable-wrap">
          <table class="dtable">
            <thead><tr><th>Nummer</th><th>Kunde</th><th>Status</th><th>Datum</th><th class="r">Betrag</th></tr></thead>
            <tbody id="liste">${zeilen}</tbody>
          </table>
        </div>
        <div class="empty-search" id="leerSuch">Keine Angebote gefunden.</div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <div><h2>Kollegen empfehlen</h2><p>Empfiehl AuftragsBoss weiter — ihr bekommt beide 1 Monat gratis.</p></div>
        </div>
        <div class="panel-b">
          <div class="field"><label>Dein persönlicher Empfehlungslink</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <input id="werbeUrl" type="text" readonly value="${escapeHtml(werbeUrl)}" style="flex:1;min-width:220px;padding:9px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13.5px;background:var(--panel-2);color:var(--ink-2);font-family:var(--mono);">
              <button class="btn" onclick="linkKopieren()">Link kopieren</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <a class="btn" href="${escapeHtml(waHref)}" target="_blank" rel="noopener">Per WhatsApp teilen</a>
            <a class="btn" href="${escapeHtml(mailHref)}">Per E-Mail teilen</a>
          </div>
          <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line);">
            <div class="field"><label>Oder: Kollege direkt per E-Mail einladen</label>
              <div class="grid2">
                <input id="wName" type="text" placeholder="Name des Kollegen">
                <input id="wEmail" type="email" placeholder="E-Mail-Adresse">
              </div>
              <div style="margin-top:10px;display:flex;align-items:center;gap:12px;">
                <button class="btn prim" onclick="perMailEinladen()">Einladung senden</button>
                <span class="statusmsg" id="werbeStatus"></span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

  const scriptExtra = `
const TOKEN = ${JSON.stringify(token)};

// Zeilen anklickbar (außer wenn der Nummern-Link direkt getroffen wird).
document.querySelectorAll("#liste tr[data-href]").forEach(function(tr){
  tr.addEventListener("click", function(e){ if(e.target.closest("a")) return; location.href = tr.getAttribute("data-href"); });
});

// Suche + Status-Filter
var statusFilter = "alle";
function anwenden(){
  var q = (document.getElementById("suche").value || "").trim().toLowerCase();
  var sichtbar = 0;
  document.querySelectorAll("#liste tr[data-such]").forEach(function(tr){
    var okText = !q || tr.getAttribute("data-such").indexOf(q) !== -1;
    var okStatus = statusFilter === "alle" || tr.getAttribute("data-status") === statusFilter;
    var zeig = okText && okStatus; tr.style.display = zeig ? "" : "none"; if(zeig) sichtbar++;
  });
  var leer = document.getElementById("leerSuch"); if(leer) leer.style.display = sichtbar === 0 ? "block" : "none";
}
var s = document.getElementById("suche"); if(s) s.addEventListener("input", anwenden);
document.querySelectorAll(".seg button").forEach(function(b){
  b.addEventListener("click", function(){
    document.querySelectorAll(".seg button").forEach(function(x){ x.classList.remove("on"); });
    b.classList.add("on"); statusFilter = b.getAttribute("data-f"); anwenden();
  });
});

function setWerbeStatus(text, farbe){ var s=document.getElementById("werbeStatus"); s.textContent=text; s.style.color=farbe; }
async function linkKopieren(){
  var inp=document.getElementById("werbeUrl");
  try{ await navigator.clipboard.writeText(inp.value); setWerbeStatus("✓ Link kopiert","var(--ok)"); }
  catch(e){ inp.select(); document.execCommand("copy"); setWerbeStatus("✓ Link kopiert","var(--ok)"); }
}
async function perMailEinladen(){
  var name=document.getElementById("wName").value.trim();
  var email=document.getElementById("wEmail").value.trim();
  if(name.length<2 || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ setWerbeStatus("Bitte Name und gültige E-Mail eingeben.","var(--warn)"); return; }
  setWerbeStatus("Wird gesendet …","var(--muted)");
  try{
    var r=await fetch("/api/empfehlung/"+TOKEN+"/email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,email:email})});
    var j=await r.json();
    if(!r.ok){ setWerbeStatus("Fehler: "+(j.fehler||r.status),"#c0261a"); return; }
    document.getElementById("wName").value=""; document.getElementById("wEmail").value="";
    setWerbeStatus("✓ Einladung an "+email+" gesendet.","var(--ok)");
  }catch(e){ setWerbeStatus("Netzwerkfehler: "+e,"#c0261a"); }
}
window.linkKopieren = linkKopieren; window.perMailEinladen = perMailEinladen;
`;

  return appShell({
    token,
    aktiv: "start",
    handwerker: h,
    logoDataUrl,
    titel: "Übersicht",
    content,
    headExtra: `.t-art{font-size:11.5px;color:var(--faint);margin-top:3px;}
  @media (max-width:720px){
    .dtable thead{display:none;}
    .dtable tbody tr{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:12px 16px;border-bottom:1px solid var(--line);}
    .dtable td{border:none;padding:2px 0;}
    .dtable td.r{text-align:right;}
    .dtable td:nth-child(2){grid-column:1;color:var(--muted);font-size:13px;}
    .dtable td:nth-child(3){grid-column:2;grid-row:1;text-align:right;}
    .dtable td:nth-child(4){grid-column:1;font-size:12px;color:var(--faint);}
    .dtable td:nth-child(5){grid-column:2;}
  }`,
    scriptExtra,
  });
}
