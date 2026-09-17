// Cockpit — die Übersichts-/Angebotsseite eines registrierten Betriebs.
//
// Erreichbar über /start/<einstellungenToken> (passwortlos, wie überall).
// Zentraler Arbeitsbereich: Begrüßung, ruhige KPI-Zeile, durchsuch- und
// filterbare Angebotstabelle, plus ein schlankes Empfehlungs-Panel. Nutzt die
// gemeinsame App-Shell (feste Sidebar + Topbar). Keine Kundenfarbe im Chrome.
import type { Handwerker } from "@prisma/client";
import { bearbeitenLink, importLink } from "./tokens.js";
import { appShell } from "./navigation.js";
import type { DokUebersicht } from "./einstellungenSeite.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
// Volles Volumen, auf ganze Euro gerundet (z.B. "12.480 €").
const euroVoll = (n: number) => Math.round(n).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

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
  /** Offene Abo-Zahlung (Stripe): Hinweis oben mit Link zur Zahlungsart. */
  zahlungOffen?: { seit: Date; portalUrl: string; rechnungUrl: string | null } | null;
}): string {
  const { handwerker: h, logoDataUrl, dokumente, kennzahlen, token, zahlungOffen } = args;
  const zahlungHinweis = zahlungOffen
    ? `<div class="panel zahlung-offen"><div class="panel-b">
        <b>💳 Deine Abo-Zahlung hat nicht geklappt.</b> Seit dem ${zahlungOffen.seit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} konnten wir die Rechnung nicht einziehen. Dein Zugang bleibt, bitte prüfe kurz deine Zahlungsart.
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;"><a class="btn prim" href="${escapeHtml(zahlungOffen.portalUrl)}">Zahlungsart prüfen</a>${zahlungOffen.rechnungUrl ? `<a class="btn" href="${escapeHtml(zahlungOffen.rechnungUrl)}" target="_blank" rel="noopener">Rechnung bezahlen</a>` : ""}</div>
      </div></div>`
    : "";
  const versandbereit = Math.max(0, kennzahlen.anzahl - kennzahlen.offen);
  const anrede = h.name ? escapeHtml(h.name.split(" ")[0]) : escapeHtml(h.firma || "");

  const icoSend = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>`;
  const icoUnlock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  const icoTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;

  const zeilen =
    dokumente.length === 0
      ? `<tr class="empty-row"><td colspan="6">Noch keine Angebote. Sprich eine WhatsApp-Nachricht ein oder importiere ein altes Angebot.</td></tr>`
      : dokumente
          .map((d) => {
            const versendet = d.versendetAm != null;
            const status = versendet
              ? `<span class="badge sent">Versendet</span>`
              : d.vollstaendig
                ? `<span class="badge ok">Versandbereit</span>`
                : `<span class="badge warn">Offene Preise</span>`;
            const statusKey = versendet ? "sent" : d.vollstaendig ? "ok" : "warn";
            const art = d.art === "ANGEBOT" ? "Angebot" : "Protokoll";
            const tok = escapeHtml(d.bearbeitenToken);
            return `<tr class="${versendet ? "row-sent" : ""}" data-href="${escapeHtml(bearbeitenLink(d.bearbeitenToken))}" data-status="${statusKey}" data-such="${escapeHtml((d.nummer + " " + (d.kundeName ?? "")).toLowerCase())}">
        <td class="t-num"><a href="${bearbeitenLink(d.bearbeitenToken)}">${escapeHtml(d.nummer)}</a>${d.version > 1 ? `<span class="t-sub">Fassung ${d.version}</span>` : ""}<div class="t-art">${art}</div></td>
        <td>${escapeHtml(d.kundeName ?? "—")}</td>
        <td>${status}</td>
        <td class="num">${datumDE(d.datum)}</td>
        <td class="r t-amount">${d.vollstaendig ? euro(d.brutto) : "—"}</td>
        <td class="t-actions">
          <button class="ico-btn" data-vtoggle="${tok}" data-versendet="${versendet ? "1" : "0"}" title="${versendet ? "Versand aufheben, wieder bearbeitbar" : "Als versendet markieren (schützt vor Änderungen)"}" aria-label="Versendet umschalten">${versendet ? icoUnlock : icoSend}</button>
          <button class="ico-btn danger" data-del="${tok}" data-nummer="${escapeHtml(d.nummer)}" title="Angebot löschen" aria-label="Löschen">${icoTrash}</button>
        </td>
      </tr>`;
          })
          .join("");

  const content = `
      <div class="page-head">
        <div>
          <h1 class="greet">${begruessung()}${anrede ? ", " + anrede : ""}</h1>
          <p class="sub">Hier sind deine Angebote im Überblick.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn" href="/export/${escapeHtml(token)}" title="Alle deine Angebote, Kunden und Einstellungen als ZIP (JSON, CSV, PDF, Fotos)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
          Meine Daten (ZIP)
        </a>
        <a class="btn prim" href="${escapeHtml(importLink(token))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Angebot importieren
        </a>
        </div>
      </div>

${zahlungHinweis}
      <div class="stats">
        <div class="stat"><div class="k"><span class="dot"></span>Angebote gesamt</div><div class="v num">${kennzahlen.anzahl}</div><div class="m">alle Angebote &amp; Protokolle</div></div>
        <div class="stat"><div class="k"><span class="dot ok"></span>Versandbereit</div><div class="v num">${versandbereit}</div><div class="m">vollständig kalkuliert</div></div>
        <div class="stat"><div class="k"><span class="dot warn"></span>Mit offenen Preisen</div><div class="v num">${kennzahlen.offen}</div><div class="m">noch zu ergänzen</div></div>
        <div class="stat"><div class="k"><span class="dot"></span>Angebotsvolumen</div><div class="v num">${euroVoll(kennzahlen.volumen)}</div><div class="m">Summe fertiger Angebote</div></div>
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
            <button data-f="sent">Versendet</button>
          </div>
        </div>
        <div class="dtable-wrap">
          <table class="dtable">
            <thead><tr><th>Nummer</th><th>Kunde</th><th>Status</th><th>Datum</th><th class="r">Betrag</th><th></th></tr></thead>
            <tbody id="liste">${zeilen}</tbody>
          </table>
        </div>
        <div class="empty-search" id="leerSuch">Keine Angebote gefunden.</div>
      </div>`;

  const scriptExtra = `
// Zeilen anklickbar (außer bei Link/Button in der Zeile).
document.querySelectorAll("#liste tr[data-href]").forEach(function(tr){
  tr.addEventListener("click", function(e){ if(e.target.closest("a") || e.target.closest("button")) return; location.href = tr.getAttribute("data-href"); });
});

// Als versendet markieren / wieder freigeben
document.querySelectorAll("#liste [data-vtoggle]").forEach(function(b){
  b.addEventListener("click", async function(e){
    e.stopPropagation();
    var tok = b.getAttribute("data-vtoggle"), ist = b.getAttribute("data-versendet") === "1";
    b.disabled = true;
    try{
      var r = await fetch("/api/a/"+tok+"/versendet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({versendet:!ist})});
      if(!r.ok) throw 0; location.reload();
    }catch(e){ b.disabled=false; alert("Der Status konnte nicht geändert werden."); }
  });
});

// Angebot löschen (mit Rückfrage)
document.querySelectorAll("#liste [data-del]").forEach(function(b){
  b.addEventListener("click", async function(e){
    e.stopPropagation();
    var tok = b.getAttribute("data-del"), nr = b.getAttribute("data-nummer") || "dieses Angebot";
    if(!confirm("Angebot "+nr+" wirklich löschen? Das lässt sich nicht rückgängig machen.")) return;
    b.disabled = true;
    try{
      var r = await fetch("/api/a/"+tok+"/loeschen",{method:"POST"});
      if(!r.ok) throw 0; location.reload();
    }catch(e){ b.disabled=false; alert("Löschen fehlgeschlagen."); }
  });
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
`;

  return appShell({
    token,
    aktiv: "start",
    handwerker: h,
    logoDataUrl,
    titel: "Übersicht",
    content,
    headExtra: `
  .zahlung-offen{border-left:4px solid #e9b949;background:#fff8e6;margin-bottom:16px;}.t-art{font-size:11.5px;color:var(--faint);margin-top:3px;}
  .badge.sent{background:#e6e9ef;color:#454b56;} .badge.sent::before{background:#8a92a0;}
  .row-sent td:not(.t-actions){opacity:.5;}
  .t-actions{white-space:nowrap;width:1%;text-align:right;}
  .ico-btn{display:inline-grid;place-items:center;width:32px;height:32px;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;color:var(--muted);cursor:pointer;transition:background .12s,color .12s,border-color .12s;vertical-align:middle;}
  .ico-btn + .ico-btn{margin-left:6px;}
  .ico-btn svg{width:16px;height:16px;}
  .ico-btn:hover{background:var(--panel-2);color:var(--ink);}
  .ico-btn.danger:hover{background:#fdecea;color:#c0392b;border-color:#f3c9c3;}
  .ico-btn:disabled{opacity:.5;cursor:default;}
  @media (max-width:720px){
    .dtable-wrap{overflow-x:visible;}
    .dtable,.dtable tbody{display:block;width:100%;}
    .dtable thead{display:none;}
    .dtable tbody tr{display:grid;grid-template-columns:1fr auto;gap:5px 12px;padding:14px 4px;align-items:center;border-bottom:1px solid var(--line);}
    .dtable tbody tr:last-child{border-bottom:none;}
    .dtable td{border:none;padding:0;min-width:0;}
    .dtable td:nth-child(1){grid-column:1;grid-row:1;}
    .dtable td:nth-child(3){grid-column:2;grid-row:1;justify-self:end;}
    .dtable td:nth-child(2){grid-column:1;grid-row:2;color:var(--muted);font-size:13px;}
    .dtable td:nth-child(5){grid-column:2;grid-row:2;justify-self:end;}
    .dtable td:nth-child(4){grid-column:1;grid-row:3;font-size:12px;color:var(--faint);}
    .dtable td.t-actions{grid-column:2;grid-row:3;justify-self:end;width:auto;}
  }`,
    scriptExtra,
  });
}
