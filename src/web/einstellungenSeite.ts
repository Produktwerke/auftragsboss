// Die persönliche Einstellungsseite eines Betriebs.
//
// Erreichbar über den passwortlosen Link /einstellungen/<token>. Hier pflegt
// der Handwerker einmalig sein Logo, seine Betriebsdaten, seine Farbe und
// Standardtexte (z.B. einen Haftungshinweis) — und sieht die Übersicht seiner
// bisherigen Angebote. Alles speichert automatisch, wie im Editor.
//
// Selbsttragende Seite mit eingebettetem CSS/JS: kein Build, kein Framework.
import type { Handwerker } from "@prisma/client";
import type { Preisliste } from "../preisliste.js";
import { bearbeitenLink } from "./tokens.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DokUebersicht {
  art: string;
  nummer: string;
  kundeName: string | null;
  datum: Date;
  brutto: number;
  vollstaendig: boolean;
  bearbeitenToken: string;
  version: number;
}

const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function einstellungenSeite(args: {
  handwerker: Handwerker;
  vorgabe: Preisliste;
  logoDataUrl: string | null;
  akzent: string;
  dokumente: DokUebersicht[];
  token: string;
}): string {
  const { handwerker: h, vorgabe, logoDataUrl, akzent, dokumente, token } = args;
  const v = vorgabe.betrieb;

  // Startwerte: die eigenen Werte des Betriebs. Wo leer, dient der Vorgabewert
  // aus preisliste.json als Platzhalter (grau, nicht gespeichert).
  const feld = (wert: string | null, platzhalter: string): { wert: string; ph: string } => ({
    wert: wert ?? "",
    ph: platzhalter,
  });
  const f = {
    firma: feld(h.firma, v.firma),
    name: feld(h.name, v.inhaber),
    strasse: feld(h.strasse, v.strasse),
    plz: feld(h.plz, v.plz),
    ort: feld(h.ort, v.ort),
    telefon: feld(h.telefon, v.telefon),
    email: feld(h.email, v.email),
    ustIdNr: feld(h.ustIdNr, v.ustIdNr),
    bank: feld(h.bank, v.bank),
    standardEinleitung: feld(h.standardEinleitung, ""),
    standardSchlusstext: feld(h.standardSchlusstext, ""),
  };

  const inp = (id: string, x: { wert: string; ph: string }, extra = "") =>
    `<input id="${id}" value="${escapeHtml(x.wert)}" placeholder="${escapeHtml(x.ph)}" ${extra}>`;

  /** Kleiner Hinweis unter einem Feld: wo der Wert im Angebot erscheint. */
  const fhint = (text: string) => `<span class="feldhint">${escapeHtml(text)}</span>`;

  const zeilen =
    dokumente.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:20px;">Noch keine Angebote — sobald das erste fertig ist, erscheint es hier.</td></tr>`
      : dokumente
          .map(
            (d) => `<tr>
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
<title>Betriebseinstellungen — AuftragsBoss</title>
<style>
  :root { --akzent: ${akzent}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#eef0f3; color:#1a1a1a; line-height:1.5; }
  .rahmen { max-width:1140px; margin:0 auto; padding:16px; }
  /* Zwei Spalten: links Eingaben, rechts sticky Live-Angebotsblatt */
  .layout { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap:20px; align-items:start; }
  .spalte-vorschau { position:sticky; top:16px; }
  /* Angebotsblatt (Live-Vorschau des ganzen Angebots) */
  .blatt { background:#fff; border:1px solid #dfe3e7; border-radius:8px; padding:24px 24px 18px; box-shadow:0 2px 14px rgba(0,0,0,.07); }
  .bl-meta { display:flex; justify-content:space-between; gap:16px; margin-top:16px; font-size:11.5px; color:#333; line-height:1.5; }
  .bl-nr { text-align:right; color:#555; white-space:nowrap; }
  .bl-titel { font-size:17px; font-weight:700; margin:16px 0 6px; }
  .bl-text { font-size:12px; color:#333; white-space:pre-wrap; margin:8px 0; }
  .blatt table { margin:10px 0; }
  .bl-tab th { padding:6px 7px; font-size:11px; }
  .bl-tab td { padding:6px 7px; font-size:11.5px; border-bottom:1px solid #eef1f3; }
  .bl-sum { width:62%; margin-left:38%; }
  .bl-sum td { padding:3px 7px; font-size:11.5px; border:none; }
  .bl-sum tr.ges td { font-weight:700; color:var(--akzent); border-top:2px solid var(--akzent); padding-top:6px; }
  .bl-gueltig { font-size:10.5px; color:#666; margin-top:10px; }
  .bl-fuss { font-size:10px; color:#8a8a8a; margin-top:16px; padding-top:8px; border-top:1px solid #eceff2; line-height:1.6; }
  .vorschau-hinweis { color:#777; font-size:13px; margin:0 0 12px; }
  h1 { font-size:22px; margin:8px 2px 2px; }
  .unter { color:#666; font-size:14px; margin:0 2px 16px; }
  .karte { background:#fff; border-radius:12px; padding:22px; margin-bottom:16px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .karte h2 { font-size:16px; margin:0 0 4px; }
  .karte .hint { color:#777; font-size:13px; margin:0 0 14px; }
  .feldhint { display:block; font-size:12px; color:#999; margin:4px 0 2px; font-weight:400; }
  label { display:block; font-size:13px; color:#555; margin:12px 0 4px; font-weight:600; }
  input, textarea { width:100%; padding:9px 11px; border:1px solid #cfd4da; border-radius:7px; font-size:15px; font-family:inherit; background:#fff; }
  textarea { min-height:90px; resize:vertical; }
  input:focus, textarea:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
  .zwei { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .plz-ort { display:grid; grid-template-columns:120px 1fr; gap:12px; }
  /* Briefkopf-Vorschau */
  .vorschau { border:1px solid #e2e6ea; border-radius:10px; padding:18px; }
  .vk { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
        border-bottom:3px solid var(--akzent); padding-bottom:12px; }
  .vk .firma { font-size:19px; font-weight:700; color:var(--akzent); }
  .vk .adr { font-size:12px; color:#666; margin-top:3px; }
  .vk img { max-height:56px; max-width:170px; object-fit:contain; }
  .vk .kein-logo { font-size:12px; color:#bbb; border:1px dashed #d5dade; border-radius:6px; padding:12px 14px; }
  /* Logo-Bereich */
  .logo-zeile { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .logo-feld { position:relative; }
  .logo-feld input[type=file] { display:none; }
  .farb-zeile { display:flex; align-items:center; gap:10px; margin-top:6px; }
  .farb-zeile input[type=color] { width:52px; height:38px; padding:2px; cursor:pointer; }
  .farb-zeile .hex { font-family:monospace; color:#555; font-size:14px; }
  table { width:100%; border-collapse:collapse; }
  th { background:var(--akzent); color:#fff; font-size:12px; text-align:left; padding:8px; font-weight:600; }
  th.r, td.r { text-align:right; }
  td { padding:9px 8px; border-bottom:1px solid #eceff2; font-size:14px; }
  td a { color:var(--akzent); font-weight:600; text-decoration:none; }
  td a:hover { text-decoration:underline; }
  .fassung { color:#888; font-size:12px; }
  .offen { color:#b7791f; }
  .tab-scroll { overflow-x:auto; }
  .btn { border:none; border-radius:8px; padding:11px 16px; font-size:15px; font-weight:600; cursor:pointer; background:#eef0f3; color:#333; }
  .btn:hover { background:#e2e6ea; }
  .btn.prim { background:var(--akzent); color:#fff; }
  .btn.prim:hover { filter:brightness(.94); }
  .btn.link { background:none; color:#c0392b; padding:8px; }
  .aktionen { position:sticky; bottom:0; background:#fff; border-radius:12px; padding:14px 16px; box-shadow:0 -2px 10px rgba(0,0,0,.08);
              display:flex; align-items:center; gap:12px; }
  .status { font-size:13px; color:#2e7d32; margin-left:auto; }
  @media (max-width:900px){
    .layout{ grid-template-columns:1fr; }
    /* Vorschau nach oben, nicht mehr klebend */
    .spalte-vorschau{ position:static; order:-1; }
  }
  @media (max-width:640px){
    .zwei{grid-template-columns:1fr;}
    .karte{padding:15px;}
    /* Angebotsübersicht: gestapelte Karten statt Quer-Scrollen */
    .tab-scroll{ overflow-x:visible; }
    table{ min-width:0; }
    thead{ display:none; }
    tbody tr{ display:block; border:1px solid #e3e7ea; border-radius:9px; padding:6px 12px 8px; margin-bottom:10px; }
    tbody td[data-label]{ display:flex; justify-content:space-between; gap:12px; border:none; padding:5px 0; text-align:right; }
    tbody td[data-label]::before{ content:attr(data-label); color:#777; font-size:12px; font-weight:600; text-align:left; flex:0 0 auto; }
    tbody td.c-num{ border-bottom:1px solid #eef1f3; padding-bottom:6px; margin-bottom:2px; font-size:15px; }
  }
</style>
</head>
<body>
<div class="rahmen">
  <h1>Betriebseinstellungen</h1>
  <p class="unter">Diese Angaben erscheinen auf jedem Angebot. Einmal einstellen — danach passt alles automatisch.</p>

  <div class="layout">
   <!-- Linke Spalte: Eingaben -->
   <div class="spalte-eingabe">

  <!-- Logo & Farbe -->
  <div class="karte">
    <h2>Logo &amp; Farbe</h2>
    <p class="hint">PNG oder JPG, am besten mit transparentem Hintergrund. Höchstens 3 MB.</p>
    <div class="logo-zeile">
      <label class="logo-feld btn prim" for="logoDatei" style="margin:0;">Logo hochladen
        <input type="file" id="logoDatei" accept="image/png,image/jpeg">
      </label>
      <button class="btn link" id="logoEntfernen" style="${logoDataUrl ? "" : "display:none;"}">Logo entfernen</button>
      <span class="status" id="logoStatus"></span>
    </div>
    <label>Akzentfarbe</label>
    <div class="farb-zeile">
      <input type="color" id="farbe" value="${akzent}">
      <input type="text" id="farbeHex" value="${akzent.toUpperCase()}" maxlength="7" spellcheck="false"
             style="width:110px;font-family:ui-monospace,monospace;text-transform:uppercase;">
      <span style="color:#888;font-size:13px;">Farbe für Briefkopf und Tabellenkopf. Hex-Code wie #FE5722 eintippen oder den Farbwähler nutzen.</span>
    </div>
  </div>

  <!-- Betriebsdaten -->
  <div class="karte">
    <h2>Betriebsdaten</h2>
    <p class="hint">Was hier steht, erscheint im Briefkopf (oben) oder in der Fußzeile Ihrer Angebote. Der Hinweis unter jedem Feld sagt, wo.</p>
    <div class="zwei">
      <div><label>Firma</label>${inp("firma", f.firma)}${fhint("Briefkopf (groß, oben) und Fußzeile")}</div>
      <div><label>Inhaber / Ansprechpartner</label>${inp("name", f.name)}${fhint("Fußzeile („Ansprechpartner: …“)")}</div>
    </div>
    <label>Straße und Hausnummer</label>${inp("strasse", f.strasse)}${fhint("Briefkopf-Adresszeile und Fußzeile")}
    <div class="plz-ort">
      <div><label>PLZ</label>${inp("plz", f.plz)}</div>
      <div><label>Ort</label>${inp("ort", f.ort)}</div>
    </div>
    ${fhint("PLZ und Ort: Briefkopf-Adresszeile und Fußzeile")}
    <div class="zwei">
      <div><label>Telefon</label>${inp("telefon", f.telefon)}${fhint("Briefkopf-Adresszeile")}</div>
      <div><label>E-Mail</label>${inp("email", f.email, 'type="email"')}${fhint("Briefkopf-Adresszeile; außerdem Absender-/Zieladresse beim Mailversand")}</div>
    </div>
    <div class="zwei">
      <div><label>USt-IdNr. (optional)</label>${inp("ustIdNr", f.ustIdNr)}${fhint("Fußzeile des Angebots")}</div>
      <div><label>Bankverbindung (optional)</label>${inp("bank", f.bank)}${fhint("Fußzeile des Angebots")}</div>
    </div>
  </div>

  <!-- Standardtexte -->
  <div class="karte">
    <h2>Standardtexte</h2>
    <p class="hint">Feste Textbausteine für jedes Angebot — z.B. eine Grußformel oder ein Gewährleistungs-/Haftungshinweis. Können Sie im Angebot jederzeit überschreiben.</p>
    <label>Standard-Anschreiben (optional)</label>
    <textarea id="standardEinleitung" placeholder="z.B. Sehr geehrte Damen und Herren, vielen Dank für Ihr Interesse …">${escapeHtml(f.standardEinleitung.wert)}</textarea>
    <label>Schlusstext / Haftungshinweis (wird an jedes Angebot angehängt)</label>
    <textarea id="standardSchlusstext" placeholder="z.B. Es gelten unsere allgemeinen Geschäftsbedingungen. Gewährleistung nach den gesetzlichen Bestimmungen.">${escapeHtml(f.standardSchlusstext.wert)}</textarea>
  </div>

  <!-- Preise / Preisgedächtnis -->
  <div class="karte">
    <h2>Preise</h2>
    <p class="hint">AuftragsBoss erfindet nie Preise. Auf Wunsch merkt es sich, wie Sie ähnliche Leistungen zuletzt kalkuliert haben, und schlägt den Preis beim nächsten Mal mit Datum vor. Sie bestätigen jeden Vorschlag selbst.</p>
    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:500;">
      <input type="checkbox" id="preisGedaechtnisAktiv" ${h.preisGedaechtnisAktiv ? "checked" : ""} style="width:auto;">
      <span>Meine Preise merken (Preisgedächtnis)</span>
    </label>
  </div>

  <!-- Ablauf -->
  <div class="karte">
    <h2>Ablauf</h2>
    <p class="hint">Vor jedem Angebot fasst AuftragsBoss per WhatsApp kurz zusammen, was es verstanden hat, damit Sie es mit „ja" bestätigen oder per Sprache korrigieren können. Wenn Sie darauf vertrauen, können Sie das abschalten (auch per Nachricht „ohne Zusammenfassung").</p>
    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:500;">
      <input type="checkbox" id="zusammenfassungAktiv" ${h.zusammenfassungAktiv ? "checked" : ""} style="width:auto;">
      <span>Vor dem Angebot kurz zusammenfassen, was verstanden wurde</span>
    </label>
  </div>

  <!-- Angebotsübersicht -->
  <div class="karte">
    <h2>Ihre Angebote</h2>
    <p class="hint">${dokumente.length} ${dokumente.length === 1 ? "Dokument" : "Dokumente"} — zum Öffnen auf die Nummer klicken.</p>
    <div class="tab-scroll">
      <table>
        <thead><tr><th>Nummer</th><th>Art</th><th>Kunde</th><th>Datum</th><th class="r">Betrag</th></tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
    </div>
  </div>

  <!-- Feedback ans Team -->
  <div class="karte">
    <h2>Feedback ans AuftragsBoss-Team</h2>
    <p class="hint">Was fehlt, was nervt, was gefällt? Wir lesen jede Rückmeldung — sie hilft uns, AuftragsBoss besser zu machen.</p>
    <textarea id="feedbackText" placeholder="Deine Nachricht an uns …"></textarea>
    <div style="margin-top:10px; display:flex; align-items:center; gap:12px;">
      <button class="btn prim" id="feedbackSenden" style="width:auto;">Absenden</button>
      <span class="status" id="feedbackStatus"></span>
    </div>
  </div>

   </div><!-- /spalte-eingabe -->

   <!-- Rechte Spalte: Live-Angebotsblatt -->
   <div class="spalte-vorschau">
    <div class="karte">
      <h2>Live-Vorschau Ihres Angebots</h2>
      <p class="vorschau-hinweis">So sieht ein Angebot mit Ihren Angaben aus. Ändert sich sofort, während Sie links tippen. (Positionen und Preise sind Beispiele.)</p>
      <div class="blatt">
        <div class="vk">
          <div>
            <div class="firma" id="pvFirma">${escapeHtml(f.firma.wert || f.firma.ph)}</div>
            <div class="adr" id="pvAdr"></div>
          </div>
          <div id="pvLogoBox">
            ${logoDataUrl ? `<img id="pvLogo" src="${logoDataUrl}" alt="Logo">` : `<div class="kein-logo" id="pvLogoLeer">noch kein Logo</div>`}
          </div>
        </div>

        <div class="bl-meta">
          <div>Familie Mustermann<br>Musterstraße 12<br>70000 Musterstadt</div>
          <div class="bl-nr">Angebot Nr. 2026-0001<br>Datum: ${datumDE(new Date())}</div>
        </div>

        <div class="bl-titel">Angebot</div>
        <div class="bl-text" id="pvEinleitung"></div>

        <table class="bl-tab">
          <thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">Gesamt</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>Wände und Decken streichen</td><td class="r">pauschal</td><td class="r">850,00 €</td><td class="r">850,00 €</td></tr>
            <tr><td>2</td><td>Alte Tapete entfernen</td><td class="r">pauschal</td><td class="r">220,00 €</td><td class="r">220,00 €</td></tr>
            <tr><td>3</td><td>Dispersionsfarbe (Material)</td><td class="r">4 Rolle</td><td class="r">45,00 €</td><td class="r">180,00 €</td></tr>
          </tbody>
        </table>
        <table class="bl-sum">
          <tr><td class="r">Nettosumme</td><td class="r">1.250,00 €</td></tr>
          <tr><td class="r">zzgl. 19 % MwSt.</td><td class="r">237,50 €</td></tr>
          <tr class="ges"><td class="r">Gesamtbetrag</td><td class="r">1.487,50 €</td></tr>
        </table>

        <div class="bl-text" id="pvSchluss"></div>
        <div class="bl-gueltig">Dieses Angebot ist gültig bis ${datumDE(new Date(Date.now() + 30 * 864e5))}. Zahlungsziel: ${escapeHtml(vorgabe.konditionen?.zahlungsziel ?? "14 Tage")}.</div>
        <div class="bl-fuss" id="pvFuss"></div>
      </div>
    </div>
   </div><!-- /spalte-vorschau -->
  </div><!-- /layout -->

  <div class="aktionen">
    <span style="font-size:14px;color:#555;">Änderungen werden automatisch gespeichert.</span>
    <span class="status" id="status"></span>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
const FELDER = ["firma","name","strasse","plz","ort","telefon","email","ustIdNr","bank","standardEinleitung","standardSchlusstext"];
const val = id => document.getElementById(id).value;

// ── Live-Vorschau des ganzen Angebots ─────────────────
function aktualisiereVorschau(){
  const ph = id => document.getElementById(id).placeholder;
  // Leeres Feld: fällt auf den Platzhalter (Vorgabe) zurück, damit das
  // Blatt nie leer wirkt — genau wie das echte Angebot die Vorgaben nutzt.
  const wert = id => val(id).trim() || ph(id);
  const firma = wert("firma");

  document.getElementById("pvFirma").textContent = firma;

  // Briefkopf-Adresszeile: Straße · PLZ Ort · Telefon · E-Mail
  const kopf = [wert("strasse"), [wert("plz"), wert("ort")].filter(Boolean).join(" "), wert("telefon"), wert("email")].filter(Boolean);
  document.getElementById("pvAdr").textContent = kopf.join("  ·  ");

  // Anschreiben und Schlusstext (mit sinnvollen Vorgaben)
  document.getElementById("pvEinleitung").textContent =
    val("standardEinleitung").trim() || "Sehr geehrte Familie Mustermann,\\nvielen Dank für Ihre Anfrage. Gerne biete ich Ihnen folgende Leistungen an:";
  document.getElementById("pvSchluss").textContent =
    val("standardSchlusstext").trim() || ("Mit freundlichen Grüßen\\n" + firma);

  // Fußzeile: Firma, Adresse · Ansprechpartner · USt-IdNr · Bank
  const fuss = [[firma, wert("strasse"), [wert("plz"), wert("ort")].filter(Boolean).join(" ")].filter(Boolean).join(", ")];
  const name = wert("name"); if(name) fuss.push("Ansprechpartner: " + name);
  const ust = wert("ustIdNr"); if(ust) fuss.push("USt-IdNr.: " + ust);
  const bank = wert("bank"); if(bank) fuss.push("Bank: " + bank);
  document.getElementById("pvFuss").textContent = fuss.join("   ·   ");

  document.documentElement.style.setProperty("--akzent", document.getElementById("farbe").value);
}

// ── Speichern (entprellt) ─────────────────────────────
let timer=null;
function markiere(){
  setStatus("status","Nicht gespeichert","#b7791f");
  aktualisiereVorschau();
  clearTimeout(timer);
  timer=setTimeout(speichern,1000);
}
async function speichern(){
  const daten={farbe:document.getElementById("farbe").value.replace("#","")};
  for(const id of FELDER) daten[id]=val(id);
  daten.preisGedaechtnisAktiv=document.getElementById("preisGedaechtnisAktiv").checked;
  daten.zusammenfassungAktiv=document.getElementById("zusammenfassungAktiv").checked;
  try{
    const r=await fetch("/api/einstellungen/"+TOKEN,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(daten)});
    if(!r.ok) throw 0;
    setStatus("status","✓ Gespeichert","#2e7d32");
  }catch(e){ setStatus("status","Speichern fehlgeschlagen","#c0392b"); }
}
function setStatus(id,text,farbe){ const s=document.getElementById(id); s.textContent=text; s.style.color=farbe; }

FELDER.forEach(id=>document.getElementById(id).addEventListener("input",markiere));
// Farbwähler und Hex-Eingabefeld halten sich gegenseitig aktuell.
const farbeInput=document.getElementById("farbe");
const farbeHexInput=document.getElementById("farbeHex");
farbeInput.addEventListener("input",()=>{ farbeHexInput.value=farbeInput.value.toUpperCase(); markiere(); });
farbeHexInput.addEventListener("input",()=>{
  let v=farbeHexInput.value.trim(); if(v && v[0]!=="#") v="#"+v;
  if(/^#[0-9a-fA-F]{6}$/.test(v)){ farbeInput.value=v; markiere(); }
});
// Beim Verlassen das Feld auf die tatsächlich gültige Farbe normalisieren.
farbeHexInput.addEventListener("blur",()=>{ farbeHexInput.value=farbeInput.value.toUpperCase(); });
document.getElementById("preisGedaechtnisAktiv").addEventListener("change",markiere);
document.getElementById("zusammenfassungAktiv").addEventListener("change",markiere);

// ── Logo hochladen ────────────────────────────────────
document.getElementById("logoDatei").addEventListener("change",function(){
  const datei=this.files&&this.files[0];
  if(!datei) return;
  if(datei.size>3*1024*1024){ setStatus("logoStatus","Bild zu groß (max. 3 MB)","#c0392b"); return; }
  setStatus("logoStatus","Wird hochgeladen …","#b7791f");
  const leser=new FileReader();
  leser.onload=async()=>{
    try{
      const r=await fetch("/api/einstellungen/"+TOKEN+"/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataUrl:leser.result})});
      const antwort=await r.json();
      if(!r.ok) throw new Error(antwort.fehler||"Fehler");
      zeigeLogo(antwort.logoDataUrl);
      setStatus("logoStatus","✓ Logo gespeichert","#2e7d32");
    }catch(e){ setStatus("logoStatus",e.message||"Upload fehlgeschlagen","#c0392b"); }
  };
  leser.readAsDataURL(datei);
  this.value=""; // gleiche Datei erneut wählbar
});

document.getElementById("logoEntfernen").addEventListener("click",async()=>{
  if(!confirm("Logo wirklich entfernen?")) return;
  try{
    const r=await fetch("/api/einstellungen/"+TOKEN+"/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entfernen:true})});
    if(!r.ok) throw 0;
    zeigeLogo(null);
    setStatus("logoStatus","Logo entfernt","#555");
  }catch(e){ setStatus("logoStatus","Fehler beim Entfernen","#c0392b"); }
});

function zeigeLogo(dataUrl){
  const box=document.getElementById("pvLogoBox");
  const entfernenBtn=document.getElementById("logoEntfernen");
  if(dataUrl){
    box.innerHTML='<img id="pvLogo" alt="Logo">';
    document.getElementById("pvLogo").src=dataUrl;
    entfernenBtn.style.display="";
  }else{
    box.innerHTML='<div class="kein-logo">noch kein Logo</div>';
    entfernenBtn.style.display="none";
  }
}

// ── Feedback absenden ─────────────────────────────────
document.getElementById("feedbackSenden").addEventListener("click", async () => {
  const t = document.getElementById("feedbackText").value.trim();
  if (t.length < 3) { setStatus("feedbackStatus","Bitte kurz etwas schreiben","#b7791f"); return; }
  setStatus("feedbackStatus","Wird gesendet …","#b7791f");
  try {
    const r = await fetch("/api/einstellungen/"+TOKEN+"/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})});
    if(!r.ok) throw 0;
    document.getElementById("feedbackText").value="";
    setStatus("feedbackStatus","✓ Danke für dein Feedback!","#2e7d32");
  } catch(e){ setStatus("feedbackStatus","Senden fehlgeschlagen","#c0392b"); }
});

aktualisiereVorschau();
</script>
</body>
</html>`;
}
