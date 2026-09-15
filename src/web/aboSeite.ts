// "Abo & Abrechnung" — eigene Seite in der App-Shell (aus der Übersicht
// hierher gezogen, dort war es unerwartet): aktuelles Abo bzw. die Tarife
// zum Buchen, plus das Empfehlungs-Panel ("1 Monat gratis").
import { jsonInsSkript } from "./jsonInsSkript.js";
import type { Handwerker } from "@prisma/client";
import { appShell } from "./navigation.js";
import { empfehlungsText, EMPFEHLUNGS_PRAEMIE_EUR } from "../empfehlung.js";
import { TARIF_PRESETS } from "../betrieb/abrechnung.js";
import type { RechnungsZeile } from "../betrieb/stripeCheckout.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Abo-Stand fürs Panel — null, wenn (noch) kein Abo existiert. */
export interface AboStand {
  tarif: string;
  monatspreis: number;
  status: string;
}

export function aboSeite(args: {
  handwerker: Handwerker;
  token: string;
  werbeUrl: string;
  abo: AboStand | null;
  /** Online-Buchung möglich (Stripe eingerichtet, kein Test-Konto)? */
  aboBuchbar: boolean;
  /** Rechnungshistorie aus Stripe (neueste zuerst); leer = nichts anzeigen. */
  rechnungen?: RechnungsZeile[];
  /** Betrieb ist Stripe-Kunde? Steuert, ob das Rechnungs-Panel erscheint. */
  hatStripeKunde?: boolean;
  /** Kundenportal erreichbar (Stripe eingerichtet + Stripe-Kunde)? Zeigt den Knopf „Abo verwalten". */
  portalVerfuegbar?: boolean;
  /** Vorgemerkte Kündigung zum Periodenende (aus Stripe); null = läuft weiter. */
  gekuendigtZum?: Date | null;
  /** Offenes Guthaben in Euro (Empfehlungsprämie), wird mit den nächsten Rechnungen verrechnet. */
  guthabenEuro?: number;
}): string {
  const { handwerker: h, token, werbeUrl, abo, aboBuchbar, rechnungen = [], hatStripeKunde, portalVerfuegbar, gekuendigtZum, guthabenEuro = 0 } = args;
  const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const guthabenZeile =
    guthabenEuro > 0
      ? `<div class="panel"><div class="panel-b abo-guthaben"><span class="abo-k">Dein Guthaben</span><span class="abo-v">${euro(guthabenEuro)}</span><span class="abo-erkl">wird mit deinen nächsten Rechnungen verrechnet und steht dort ausgewiesen</span></div></div>`
      : "";
  const teilenText = empfehlungsText(h.firma || "Ein Kollege", werbeUrl);
  const waHref = `https://wa.me/?text=${encodeURIComponent(teilenText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("Empfehlung: AuftragsBoss")}&body=${encodeURIComponent(teilenText)}`;

  // Tarif-Karten — Preise zentral aus TARIF_PRESETS (eine Quelle für Cockpit,
  // Stripe-Zuordnung und diese Seite); Kontingente müssen zur Landingpage passen.
  const TARIF_KARTEN = [
    { key: "basis", name: "Basis", preis: TARIF_PRESETS.BASIS, angebote: 50, beliebt: false },
    { key: "profi", name: "Profi", preis: TARIF_PRESETS.PROFI, angebote: 120, beliebt: true },
    { key: "team", name: "Team", preis: TARIF_PRESETS.TEAM, angebote: 300, beliebt: false },
  ];

  let aboPanel: string;
  if (abo && abo.status === "AKTIV") {
    const tarifName =
      abo.tarif === "INDIVIDUELL" ? "Individuell" : abo.tarif.charAt(0) + abo.tarif.slice(1).toLowerCase();
    const kuendigung = gekuendigtZum
      ? `<p class="abo-hinweis">Gekündigt zum <b>${datumDE(gekuendigtZum)}</b>. Bis dahin kannst du AuftragsBoss voll nutzen. Umentschieden? Im Portal lässt sich die Kündigung zurücknehmen.</p>`
      : "";
    const verwalten = portalVerfuegbar
      ? `<div class="abo-aktionen">
            <a class="btn" href="/abo/verwalten/${escapeHtml(token)}">Abo verwalten</a>
            <span class="abo-erkl">Zahlungsart, Rechnungsadresse, Rechnungen und Kündigung</span>
          </div>`
      : "";
    aboPanel = `
      <div class="panel">
        <div class="panel-b abo-aktiv">
          <div>
            <div class="abo-k">Dein Abo</div>
            <div class="abo-v">${escapeHtml(tarifName)} · ${abo.monatspreis.toLocaleString("de-DE")} € im Monat zzgl. MwSt.</div>
          </div>
          ${gekuendigtZum ? `<span class="badge warn">Endet ${datumDE(gekuendigtZum)}</span>` : `<span class="badge ok">Aktiv</span>`}
        </div>
        ${kuendigung || verwalten ? `<div class="panel-b abo-fuss">${kuendigung}${verwalten}</div>` : ""}
      </div>`;
  } else if (aboBuchbar) {
    aboPanel = `
      <div class="panel">
        <div class="promo-head">
          <h2>Wähle dein Abo</h2>
          <p>Alle Tarife enthalten WhatsApp-Angebote, PDF- und Word-Export, E-Mail-Versand und dein Logo. Monatlich kündbar, Preise zzgl. MwSt.</p>
        </div>
        <div class="panel-b tarife">
          ${TARIF_KARTEN.map(
            (t) => `
          <div class="tarif${t.beliebt ? " beliebt" : ""}">
            ${t.beliebt ? `<span class="tarif-flag">Beliebt</span>` : ""}
            <div class="tarif-name">${t.name}</div>
            <div class="tarif-preis">${t.preis} €<span> / Monat</span></div>
            <div class="tarif-m">bis zu ${t.angebote} Angebote im Monat</div>
            <a class="btn prim" href="/abo/buchen/${escapeHtml(token)}?tarif=${t.key}">Jetzt buchen</a>
          </div>`,
          ).join("")}
        </div>
      </div>`;
  } else {
    aboPanel = `
      <div class="panel">
        <div class="panel-b">
          <div class="abo-k">Dein Abo</div>
          <p style="margin:6px 0 0;color:var(--muted);font-size:14px;line-height:1.55;">
            Die Online-Buchung ist noch nicht freigeschaltet. Melde dich einfach kurz per WhatsApp, wir kümmern uns.
          </p>
        </div>
      </div>`;
  }

  // Rechnungs-Panel: Historie mit PDF-Download (nur für Stripe-Kunden).
  let rechnungsPanel = "";
  if (hatStripeKunde) {
    const statusBadge = (s: string) =>
      s === "paid"
        ? `<span class="badge ok">Bezahlt</span>`
        : s === "open"
          ? `<span class="badge warn">Offen</span>`
          : `<span class="badge neutral">${escapeHtml(s || "—")}</span>`;
    const zeilen = rechnungen
      .map(
        (r) => `<tr>
          <td class="t-num">${escapeHtml(r.nummer)}</td>
          <td class="num">${datumDE(r.datum)}</td>
          <td class="r t-amount">${euro(r.bruttoEuro)}</td>
          <td>${statusBadge(r.status)}</td>
          <td class="r">${r.pdfUrl ? `<a class="btn sm" href="${escapeHtml(r.pdfUrl)}" target="_blank" rel="noopener">PDF herunterladen</a>` : r.webUrl ? `<a class="btn sm" href="${escapeHtml(r.webUrl)}" target="_blank" rel="noopener">Ansehen</a>` : "—"}</td>
        </tr>`,
      )
      .join("");
    rechnungsPanel = `
      <div class="panel">
        <div class="panel-h"><div><h2>Rechnungen</h2><p>Alle Abo-Rechnungen mit Download, Beträge inkl. MwSt.</p></div></div>
        ${
          rechnungen.length
            ? `<div class="dtable-wrap"><table class="dtable rech-tabelle">
          <thead><tr><th>Nummer</th><th>Datum</th><th class="r">Betrag</th><th>Status</th><th></th></tr></thead>
          <tbody>${zeilen}</tbody>
        </table></div>`
            : `<div class="panel-b" style="color:var(--faint);font-size:14px;">Noch keine Rechnungen vorhanden.</div>`
        }
      </div>`;
  }

  const content = `
      <div class="page-head">
        <div>
          <h1 class="greet">Abo &amp; Abrechnung</h1>
          <p class="sub">Dein Tarif, deine Rechnungen und dein Empfehlungs-Bonus an einem Ort.</p>
        </div>
      </div>
${aboPanel}
${guthabenZeile}
${rechnungsPanel}
      <div class="panel promo">
        <div class="promo-head">
          <span class="promo-badge">${EMPFEHLUNGS_PRAEMIE_EUR} € Prämie</span>
          <h2>Empfehlen lohnt sich: ${EMPFEHLUNGS_PRAEMIE_EUR} € für jeden Kollegen</h2>
          <p>Für jeden Kollegen, der über deinen Link Kunde wird, schreiben wir dir <b>${EMPFEHLUNGS_PRAEMIE_EUR} € auf deine nächsten Rechnungen gut</b>. Dein Kollege testet 14 Tage kostenlos. Schon ein paar Empfehlungen, und dein Abo ist für Monate bezahlt.</p>
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
const TOKEN = ${jsonInsSkript(token)};
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
    aktiv: "abo",
    handwerker: h,
    titel: "Abo & Abrechnung",
    content,
    headExtra: `
  .abo-aktiv{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
  .abo-k{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin-bottom:4px;}
  .abo-v{font-size:16px;font-weight:700;}
  .abo-fuss{border-top:1px solid var(--line);padding-top:14px;}
  .abo-guthaben{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;}
  .abo-hinweis{margin:0 0 12px;color:var(--muted);font-size:14px;line-height:1.55;}
  .abo-aktionen{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .abo-erkl{color:var(--faint);font-size:13px;}
  .tarife{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .tarif{position:relative;border:1px solid var(--line-2);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;background:var(--panel);}
  .tarif.beliebt{border-color:#e3b93c;box-shadow:0 0 0 1px #e3b93c;}
  .tarif-flag{position:absolute;top:-11px;right:14px;background:#ffd166;color:#1a1a1a;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;}
  .tarif-name{font-weight:800;font-size:15px;}
  .tarif-preis{font-size:26px;font-weight:800;letter-spacing:-.02em;}
  .tarif-preis span{font-size:13px;font-weight:600;color:var(--muted);letter-spacing:0;}
  .tarif-m{color:var(--muted);font-size:13px;margin-bottom:10px;}
  .tarif .btn{margin-top:auto;}
  .rech-tabelle tbody tr{cursor:default;}
  @media (max-width:720px){.tarife{grid-template-columns:1fr;}}
  .promo{background:linear-gradient(180deg,#fbfcfd,var(--panel));}
  .promo-head{padding:22px 22px 8px;}
  .promo-badge{display:inline-block;background:var(--ok-bg);color:var(--ok);font-weight:800;font-size:12px;padding:5px 12px;border-radius:999px;letter-spacing:.01em;margin-bottom:12px;}
  .promo-head h2{font-size:19px;font-weight:800;margin:0 0 6px;letter-spacing:-.01em;}
  .promo-head p{margin:0;color:var(--muted);font-size:14px;line-height:1.55;max-width:62ch;}`,
    scriptExtra,
  });
}
