// Erzeugt die HTML-Bearbeitungsseite für den Handwerker.
//
// Alles, was die KI erkannt hat, ist vorausgefüllt. Der Handwerker klickt
// hinein, ändert, ergänzt oder löscht Zeilen — die Summen rechnen im Browser
// live mit. Kein Word, keine Tabelle, kein Login. Gespeichert und exportiert
// wird über kleine API-Aufrufe (siehe routes.ts).
//
// Bewusst als eine selbsttragende Seite mit eingebettetem CSS und JS: kein
// Build-Schritt, kein Framework, lädt auch auf einem alten Handy schnell.
import type { Dokument, Handwerker } from "@prisma/client";
import type { Preisliste } from "../preisliste.js";
import { EINHEITEN } from "../preisliste.js";
import type { EingabePosition } from "../angebot/berechnung.js";
import { ladeLogo } from "../betrieb/logo.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function editorSeite(args: {
  dokument: Dokument;
  handwerker: Handwerker;
  preisliste: Preisliste;
  /** Link zurück zu den Betriebseinstellungen inkl. Angebotsübersicht. */
  einstellungenUrl?: string;
  /** PLZ-Nachschlag-Knopf anzeigen (Feature-Flag FEATURE_PLZ_LOOKUP). */
  plzLookup?: boolean;
}): string {
  const { dokument, preisliste, einstellungenUrl, handwerker, plzLookup } = args;
  const b = preisliste.betrieb;
  const akzent = `#${/^[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe : "0B5CAD"}`;
  const logo = ladeLogo(b.logo);
  const positionen = JSON.parse(dokument.positionenJson) as EingabePosition[];
  const istAngebot = dokument.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Protokoll";

  // Datum als YYYY-MM-DD für das date-Eingabefeld
  const datumIso = dokument.datum.toISOString().slice(0, 10);

  // Anfangsdaten für das Skript — als JSON in die Seite eingebettet
  const startDaten = {
    token: dokument.bearbeitenToken,
    art: dokument.art,
    nummer: dokument.nummer,
    kundenNummer: dokument.kundenNummer ?? "",
    datum: datumIso,
    mwstSatz: dokument.mwstSatz,
    kundeName: dokument.kundeName ?? "",
    kundeStrasse: dokument.kundeStrasse ?? "",
    kundePlzOrt: dokument.kundePlzOrt ?? "",
    objekt: dokument.objekt ?? "",
    einleitung: dokument.einleitung,
    schlusstext: dokument.schlusstext,
    positionen,
    angenommen: dokument.angenommenAm !== null,
    versendet: dokument.versendetAm !== null,
  };

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titel)} ${escapeHtml(dokument.nummer)} bearbeiten</title>
<style>
  :root { --akzent: ${akzent}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
         background:#eef0f3; color:#1a1a1a; line-height:1.5; }
  .rahmen { max-width: 860px; margin: 0 auto; padding: 16px; }
  .zurueck { display:inline-block; margin-bottom:12px; color:var(--akzent); text-decoration:none;
             font-size:14px; font-weight:600; }
  .zurueck:hover { text-decoration:underline; }
  .karte { background:#fff; border-radius:12px; padding:22px; margin-bottom:16px;
           box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .kopf { display:flex; justify-content:space-between; align-items:center; gap:16px;
          border-bottom:3px solid var(--akzent); padding-bottom:14px; margin-bottom:18px; }
  .kopf .firma { font-size:20px; font-weight:700; color:var(--akzent); }
  .kopf .adr { font-size:12px; color:#666; margin-top:2px; }
  .kopf img { max-height:64px; max-width:180px; }
  /* Platzhalter, solange der Betrieb kein eigenes Logo hochgeladen hat — macht
     klar: "hier kommt nach der Anmeldung dein Logo hin". Erscheint NUR im
     Editor, nicht im fertigen Kunden-Dokument (PDF/Word). */
  .kopf .logo-platzhalter { min-width:120px; height:56px; border:2px dashed #cfd4da;
         border-radius:8px; display:flex; align-items:center; justify-content:center;
         color:#9aa1a8; font-size:13px; font-weight:600; }
  label { display:block; font-size:13px; color:#555; margin:12px 0 4px; font-weight:600; }
  input, textarea, select { width:100%; padding:9px 11px; border:1px solid #cfd4da;
         border-radius:7px; font-size:15px; font-family:inherit; background:#fff; }
  textarea { min-height:80px; resize:vertical; }
  input:focus, textarea:focus, select:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
  /* Positionsbeschreibung: einzeiliges Textfeld, das mit dem Inhalt mitwächst
     statt abzuschneiden. */
  textarea.pos-beschr { min-height:0; height:auto; padding:6px 7px; font-size:14px;
         line-height:1.35; resize:none; overflow:hidden; display:block; }
  .pos-einheit-custom { display:block; width:100%; max-width:180px; margin-top:4px; }
  /* E-Mail-Versand unter den Export-Knöpfen */
  .mail-zeile { margin-top:12px; border-top:1px solid #eceff2; padding-top:12px; }
  .mail-zeile label.chk { display:flex; align-items:center; gap:8px; font-size:14px;
         font-weight:600; color:#444; margin:0; cursor:pointer; }
  .mail-zeile label.chk input { width:auto; }
  .mail-eingabe { margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .mail-eingabe input { width:auto; flex:1; min-width:180px; max-width:320px; }
  .mail-aendern { background:none; border:none; color:var(--akzent); font-size:13px;
         cursor:pointer; text-decoration:underline; padding:0; }
  .mail-status { font-size:13px; margin-top:6px; }
  .zwei { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .drei { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  .tab-scroll { overflow-x:auto; margin:8px -6px 0; padding:0 6px; }
  table { width:100%; min-width:560px; border-collapse:collapse; }
  th { background:var(--akzent); color:#fff; font-size:12px; text-align:left; padding:8px; font-weight:600; }
  th.r, td.r { text-align:right; }
  td { padding:6px 6px; border-bottom:1px solid #eceff2; vertical-align:middle; }
  td input, td select { padding:6px 7px; font-size:14px; }
  .pos-menge { width:70px; } .pos-einheit { width:82px; } .pos-preis { width:92px; }
  .zeilensumme { font-weight:600; white-space:nowrap; font-size:14px; }
  /* Kategorie-Kopfzeile in der Akzentfarbe: Kategoriename groß, die Spalten-
     überschriften (Menge/Einheit/…) etwas kleiner, alles in EINER Zeile. */
  tr.abschnitt td { background:var(--akzent); color:#fff; font-weight:600; font-size:12px; padding:8px 8px; vertical-align:middle; }
  tr.abschnitt td.k-name { font-weight:700; font-size:15px; }
  tr.zwsumme td { color:#666; font-weight:600; font-size:13px; background:#fafbfc; }
  tr.hinzu td { border-bottom:none; padding:6px; }
  .neu { background:#f2f5f8; border:1px dashed #b8c0c8; color:#444; border-radius:7px;
         padding:8px; width:100%; cursor:pointer; font-size:13px; }
  .neu:hover { background:#e9edf1; }
  .kat-neu { margin-top:12px; display:flex; gap:8px; }
  .kat-neu input { flex:1; }
  .kat-neu button { white-space:nowrap; }
  .summen { margin-top:16px; margin-left:auto; width:min(340px,100%); font-size:15px; }
  .summen .z { display:flex; justify-content:space-between; padding:5px 0; }
  .summen .gesamt { border-top:2px solid var(--akzent); margin-top:6px; padding-top:10px;
                    font-size:19px; font-weight:700; color:var(--akzent); }
  .offen { color:#aab0b6; letter-spacing:1px; }
  .loeschen { background:none; border:none; color:#c0392b; font-size:20px; cursor:pointer;
              padding:0 4px; line-height:1; }
  .loeschen:hover { color:#e74c3c; }
  /* z-index über den klebenden Kategorie-Überschriften (z-index:5), damit die
     Überschriften beim Scrollen HINTER dieser unteren Leiste verschwinden,
     nicht darüber. */
  .aktionen { position:sticky; bottom:0; z-index:20; background:#fff; border-radius:12px; padding:14px 16px;
              box-shadow:0 -2px 10px rgba(0,0,0,.08); }
  .aktionen .zeile1 { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .dl-label { font-size:14px; font-weight:600; color:#555; }
  .btn { border:none; border-radius:8px; padding:11px 16px; font-size:15px; font-weight:600;
         cursor:pointer; background:#eef0f3; color:#333; }
  .btn:hover { background:#e2e6ea; }
  .status { font-size:13px; color:#2e7d32; margin-left:auto; }
  .hinweis { background:#eaf2fb; border-radius:8px; padding:12px 14px; font-size:14px; margin-bottom:14px; }
  .warn { background:#fff8e6; }
  @media (max-width:640px){
    .zwei, .drei { grid-template-columns:1fr; }
    .karte { padding:14px; }
    .kopf img { max-height:44px; max-width:120px; }
    .aktionen .zeile1 { gap:8px; }
    .btn { padding:10px 13px; font-size:14px; flex:1; }
    .status { flex-basis:100%; margin-left:0; text-align:right; }

    /* Positionstabelle: auf dem Handy gestapelte Karten statt Quer-Scrollen */
    .tab-scroll { overflow-x:visible; margin:8px 0 0; padding:0; }
    /* Tabelle auf dem Handy als Block-Layout — damit die Zeilen als Karten
       stapeln UND die klebenden Überschriften funktionieren: position:sticky
       braucht einen umschließenden Block. Jede Kategorie ist ein eigener
       <tbody> (display:block) und damit ein eigener Klebe-Bereich — so schiebt
       die nächste Überschrift die vorige beim Weiterscrollen sauber hinaus. */
    table { display:block; min-width:0; }
    thead { display:none; }
    #postab tbody { display:block; }
    /* Kategorie-Überschriften (Material, Arbeitsaufwand, eigene) bleiben beim
       Hochscrollen am oberen Rand kleben und werden im Moment des Klebens
       größer und prominenter — so weiß der Handwerker immer, in welcher
       Kategorie er sich befindet. Mehrere gestapelte Sticky-Überschriften
       schieben sich von selbst gegenseitig hinaus (das macht position:sticky). */
    #postab tr.abschnitt {
      display:block; position:sticky; top:0; z-index:5;
    }
    /* Auf dem Handy nur den Kategoriename als Banner; die Spaltenüberschriften
       ausblenden (die Positions-Karten haben eigene Feldlabels). */
    #postab tr.abschnitt td.k-sp { display:none; }
    #postab tr.abschnitt td.k-name {
      display:block; background:var(--akzent); color:#fff; font-weight:700;
      font-size:15px; padding:11px 12px; border-radius:8px;
      box-shadow:0 1px 3px rgba(0,0,0,.15);
      transition:font-size .12s ease, padding .12s ease, box-shadow .12s ease, letter-spacing .12s ease;
    }
    #postab tr.abschnitt td.k-name.klebt {
      font-size:19px; padding:16px 14px; letter-spacing:.4px;
      border-radius:0 0 10px 10px; box-shadow:0 6px 16px rgba(0,0,0,.28);
    }
    #postab tr.hinzu td { display:block; border-bottom:none; padding:6px 0; }
    #postab tr.zwsumme { display:block; }
    #postab tr.zwsumme td { display:flex; justify-content:space-between; border-bottom:none; }
    /* echte Positionszeilen als Karte */
    #postab tr:not(.abschnitt):not(.hinzu):not(.zwsumme){
      display:block; background:#fff; border:1px solid #e3e7ea; border-radius:9px;
      padding:6px 10px 10px; margin:0 0 10px;
    }
    #postab tr:not(.abschnitt):not(.hinzu):not(.zwsumme) td{
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      border-bottom:none; padding:6px 0; text-align:left;
    }
    #postab td[data-label]::before{
      content:attr(data-label); color:#777; font-size:12px; font-weight:600; flex:0 0 auto;
    }
    #postab td.c-beschr{ display:block; padding-top:2px; }
    #postab td.c-beschr::before{ display:block; margin-bottom:4px; }
    #postab td.c-beschr input{ width:100%; }
    #postab td .pos-menge, #postab td .pos-einheit, #postab td .pos-preis{ width:auto; flex:0 0 58%; }
    #postab td.zeilensumme{ font-size:15px; font-weight:600; }
    #postab td.c-del{ justify-content:flex-end; padding-top:0; }
    #postab td.c-del .loeschen{ font-size:24px; }
    /* Eigene Einheit ("Andere…"): Freitextfeld auf eigene Zeile, volle Breite,
       damit es auf dem Handy nicht überläuft. */
    #postab td.c-einheit{ flex-wrap:wrap; }
    #postab td.c-einheit .pos-einheit-custom{ flex:1 0 100%; width:100%; max-width:none; margin-top:6px; }
  }
  /* Herkunfts-Etiketten je Zeile (woher der Preis kommt) */
  .hk-box{ margin-top:3px; line-height:1; }
  .hk{ display:inline-block; font-size:11px; line-height:1.4; padding:1px 8px; border-radius:10px; font-weight:600; }
  .hk-vor{ background:#fff3e0; color:#b7791f; }
  .hk-ged{ background:#e8f0fe; color:#1a56c4; }
  .hk-dik{ background:#eef2f5; color:#5a636b; }
  .hk-lst{ background:#eef7ee; color:#2e7d32; }
  .hk-man{ background:#f0f0f2; color:#555; }
  /* Test-Angebot: Export gesperrt, Hinweis auf WhatsApp */
  .btn.locked{ opacity:.5; cursor:not-allowed; }
  /* Versendet = schreibgeschützt: Eingaben gesperrt, Export bleibt möglich */
  .gesperrt input, .gesperrt textarea, .gesperrt select,
  .gesperrt .neu, .gesperrt .loeschen { pointer-events:none; opacity:.55; }
  .test-note{ margin-top:10px; padding:14px 16px; background:#fff8e6; border:1px solid #f0d98a; border-radius:10px; }
  .test-note p{ margin:0 0 10px; font-size:14px; color:#5c4d00; line-height:1.5; }
  .test-note .wa-btn{ display:inline-flex; align-items:center; gap:8px; background:#25D366; color:#fff; text-decoration:none;
                      font-weight:700; padding:11px 18px; border-radius:9px; font-size:15px; }
  .test-note .wa-btn:hover{ filter:brightness(.96); }
  .test-note .nr{ margin-top:10px; font-size:13px; color:#6a5d1f; }
</style>
</head>
<body>
<div class="rahmen">

  ${
    einstellungenUrl
      ? `<a class="zurueck" href="${escapeHtml(einstellungenUrl)}">← Zurück zur Übersicht</a>`
      : ""
  }

  ${
    startDaten.angenommen
      ? `<div class="hinweis warn">🔒 Dieses Angebot wurde vom Kunden bereits angenommen und ist eingefroren.
         Änderungen erzeugen eine neue Fassung.</div>`
      : ""
  }

  ${
    startDaten.versendet
      ? `<div class="hinweis warn">🔒 Als <b>versendet</b> markiert und schreibgeschützt. Ansehen und Export gehen weiterhin, Ändern nicht. Zum Bearbeiten den Versand-Status in der Übersicht wieder aufheben.</div>`
      : ""
  }

  <div class="karte">
    <div class="kopf">
      <div>
        <div class="firma">${escapeHtml(b.firma)}</div>
        <div class="adr">${escapeHtml([b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon].filter(Boolean).join(" · "))}</div>
      </div>
      ${logo ? `<img src="${logo.dataUrl}" alt="Logo">` : `<div class="logo-platzhalter">Dein Logo</div>`}
    </div>

    <div class="zwei">
      <div><label>Kunde</label><input id="kundeName" value="${escapeHtml(startDaten.kundeName)}" placeholder="z. B. Familie Müller"></div>
      <div><label>Kundennummer</label><input id="kundenNummer" value="${escapeHtml(startDaten.kundenNummer)}" placeholder="optional"></div>
    </div>
    <div class="zwei">
      <div><label>Straße und Hausnummer</label><input id="kundeStrasse" value="${escapeHtml(startDaten.kundeStrasse)}" placeholder="z. B. Musterstraße 5"></div>
      <div><label>PLZ und Ort</label>
        <div style="display:flex;gap:8px;align-items:stretch">
          <input id="kundePlzOrt" value="${escapeHtml(startDaten.kundePlzOrt)}" placeholder="z. B. 12345 Musterstadt" style="flex:1">
          ${plzLookup ? `<button type="button" id="plzBtn" title="PLZ aus Straße und Ort suchen" style="white-space:nowrap;padding:0 12px;border:1px solid #cbd2da;border-radius:8px;background:#f3f4f6;cursor:pointer">🔍 PLZ</button>` : ``}
        </div>
        ${plzLookup ? `<div id="plzHint" style="font-size:12px;color:#6b7280;margin-top:4px;min-height:16px"></div>` : ``}
      </div>
    </div>
    <div class="zwei">
      <div><label>${istAngebot ? "Angebotsnummer" : "Protokollnummer"}</label><input id="nummer" value="${escapeHtml(startDaten.nummer)}"></div>
      <div><label>${istAngebot ? "Angebotsdatum" : "Datum"}</label><input id="datum" type="date" value="${startDaten.datum}"></div>
    </div>
    <label>Objekt / Kurzbeschreibung</label>
    <input id="objekt" value="${escapeHtml(startDaten.objekt)}" placeholder="z. B. Wohnzimmer, ca. 45 m²">

    <label>Anschreiben (Einleitung)</label>
    <textarea id="einleitung">${escapeHtml(startDaten.einleitung)}</textarea>
  </div>

  <div class="karte">
    <label style="margin-top:0;">Positionen</label>
    <div class="tab-scroll">
    <table id="postab"></table>
    </div>

    <div class="kat-neu">
      <input id="katName" placeholder="Eigene Kategorie, z. B. Gerüst oder Entsorgung">
      <button class="neu" style="width:auto;" onclick="neueKategorie()">+ Kategorie hinzufügen</button>
    </div>

    <div class="summen" id="summenBlock"></div>
  </div>

  <div class="karte">
    <label style="margin-top:0;">Schlusstext</label>
    <textarea id="schlusstext">${escapeHtml(startDaten.schlusstext)}</textarea>
  </div>

  ${
    handwerker.istTest
      ? `<div class="aktionen">
    <div class="zeile1">
      <span class="dl-label">Herunterladen als:</span>
      <button class="btn locked" disabled title="Im Test nicht verfügbar">PDF</button>
      <button class="btn locked" disabled title="Im Test nicht verfügbar">Word</button>
    </div>
    <div class="test-note">
      <p><b>Das ist ein kostenloses Testangebot.</b> Download als PDF/Word und der E-Mail-Versand stehen nur für registrierte Betriebe über WhatsApp zur Verfügung.</p>
      <a class="wa-btn" href="https://wa.me/491749364823?text=Hallo%20AuftragsBoss%2C%20ich%20m%C3%B6chte%20mein%20Angebot%20als%20PDF%20und%20loslegen." target="_blank" rel="noopener">▶ Jetzt über WhatsApp testen</a>
      <div class="nr">oder schreib direkt an: <b>+49 174 9364823</b></div>
    </div>
  </div>`
      : `<div class="aktionen">
    <div class="zeile1">
      <span class="dl-label">Herunterladen als:</span>
      <button class="btn" onclick="exportieren('pdf')">PDF</button>
      <button class="btn" onclick="exportieren('word')">Word</button>
      <span class="status" id="status"></span>
    </div>
    <div class="mail-zeile">
      <label class="chk"><input type="checkbox" id="mailChk" onchange="mailHakenGeaendert()">
        <span id="mailChkText">Datei auch als E-Mail senden</span></label>
      <button class="mail-aendern" id="mailAendern" type="button" onclick="mailEingabeZeigen()" style="display:none;">E-Mail-Adresse ändern</button>
      <div class="mail-eingabe" id="mailEingabe" style="display:none;">
        <input id="mailAdresse" type="email" inputmode="email" placeholder="deine@firma.de">
        <button class="btn" onclick="mailSpeichern()">Speichern</button>
      </div>
      <div class="mail-status" id="mailStatus"></div>
    </div>
  </div>`
  }

</div>

<script>
const START = ${JSON.stringify(startDaten)};
const EINHEITEN = ${JSON.stringify(EINHEITEN)};
const MAIL = ${JSON.stringify({ email: handwerker.email ?? "", standard: handwerker.mailStandard })};
// Sprechende Beschriftung im Dropdown; gespeichert wird der kurze Code.
const EINHEIT_LABEL = {m2:'m²', lfm:'lfm', Stk:'Stk.', Std:'Std.', l:'Liter', kg:'kg', Sack:'Sack', Gebinde:'Gebinde', Rolle:'Rolle', pauschal:'pauschal'};
const einheitLabel = e => EINHEIT_LABEL[e] || e;
let positionen = START.positionen.map(p => ({
  kategorie: p.kategorie, beschreibung: p.beschreibung,
  menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis,
  // Herkunft mitführen, damit sie beim Speichern erhalten bleibt (früher ging
  // sie verloren und jeder Preis wurde fälschlich zu "DIKTAT").
  preisquelle: p.preisquelle || (p.einzelpreis!=null ? 'DIKTAT' : 'UNBEKANNT'),
  vorschlag: !!p.vorschlag, mengeUnsicher: !!p.mengeUnsicher,
  preisStand: p.preisStand || null
}));

const euro = n => n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const OFFEN = '<span class="offen">___ €</span>';
const katName = k => k==='LEISTUNG' ? 'Arbeitsaufwand' : (k==='MATERIAL' ? 'Material' : k);

// Herkunft einer Zeile als kleines, verständliches Etikett. Zeigt dem Handwerker
// auf einen Blick, woher ein Preis kommt und was er noch prüfen sollte, ohne die
// Oberfläche zu überladen. Vorschläge haben Vorrang (die will er bewusst prüfen).
function fmtDatum(iso){ try{ return new Date(iso).toLocaleDateString('de-DE'); }catch(e){ return ''; } }
function herkunftHtml(p){
  if(p.vorschlag) return '<span class="hk hk-vor">Vorschlag, bitte prüfen</span>';
  switch(p.preisquelle){
    case 'PREISGEDAECHTNIS':
      return '<span class="hk hk-ged">aus Preisgedächtnis'+(p.preisStand?', zuletzt '+fmtDatum(p.preisStand):'')+'</span>';
    case 'DIKTAT':    return '<span class="hk hk-dik">aus Diktat</span>';
    case 'PREISLISTE':return '<span class="hk hk-lst">aus Preisliste</span>';
    case 'MANUELL':   return '<span class="hk hk-man">selbst eingetragen</span>';
    default:          return '';
  }
}

function zeilensumme(p){
  const menge = p.einheit==='pauschal' ? (p.menge??1) : p.menge;
  if(menge==null || p.einzelpreis==null) return null;
  return Math.round(menge*p.einzelpreis*100)/100;
}

/** Kategorien in Anzeige-Reihenfolge: Material zuerst, dann Arbeitsaufwand,
 *  danach eigene Kategorien in der Reihenfolge ihres ersten Auftretens.
 *  (Gleiche Logik wie im Backend, damit Editor und PDF/Word übereinstimmen.) */
function kategorien(){
  const reihe = [];
  for(const p of positionen){ if(!reihe.includes(p.kategorie)) reihe.push(p.kategorie); }
  const rang = k => k==='MATERIAL' ? 0 : (k==='LEISTUNG' ? 1 : 2);
  const orig = reihe.slice();
  return reihe.sort((a,b)=> rang(a)-rang(b) || orig.indexOf(a)-orig.indexOf(b));
}

function render(){
  const tabelle = document.getElementById('postab');
  // Jede Kategorie bekommt ihren EIGENEN <tbody> — so ist jede Kategorie ihr
  // eigener Klebe-Bereich: die Überschrift der nächsten Kategorie schiebt die
  // vorige beim Scrollen sauber hinaus (statt sich nur zu überlagern).
  tabelle.querySelectorAll('tbody').forEach(tb=>tb.remove());
  const kats = kategorien();
  const mehrere = kats.length > 1;

  for(const kat of kats){
    const tbody = document.createElement('tbody');
    tbody.className = 'kat-gruppe';
    // Kategorie-Kopfzeile: Name + Spaltenüberschriften in EINER blauen Zeile
    // (keine separate „Leistung"-Zeile mehr). Auf dem Handy werden die Spalten-
    // labels ausgeblendet, dort bleibt nur der Kategoriename als Banner.
    const trK = document.createElement('tr');
    trK.className='abschnitt';
    trK.innerHTML =
      '<td class="k-name">'+esc(katName(kat))+'</td>'+
      '<td class="r k-sp">Menge</td>'+
      '<td class="k-sp">Einheit</td>'+
      '<td class="r k-sp">Einzelpreis</td>'+
      '<td class="r k-sp">Gesamt</td>'+
      '<td class="k-sp"></td>';
    tbody.appendChild(trK);
    positionen.forEach((p,i)=>{
      if(p.kategorie!==kat) return;
      const g = zeilensumme(p);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="c-beschr" data-label="Leistung"><textarea class="pos-beschr" rows="1" oninput="setF('+i+',\\'beschreibung\\',this.value); autoWachs(this)">'+esc(p.beschreibung)+'</textarea><div class="hk-box">'+herkunftHtml(p)+'</div></td>'+
        '<td class="r" data-label="Menge"><input class="pos-menge r" inputmode="decimal" value="'+(p.menge??'')+'" oninput="setNum('+i+',\\'menge\\',this.value,this)"></td>'+
        '<td class="c-einheit" data-label="Einheit">'+einheitZelle(i,p.einheit)+'</td>'+
        '<td class="r" data-label="Einzelpreis"><input class="pos-preis r" inputmode="decimal" value="'+(p.einzelpreis??'')+'" placeholder="___" oninput="setNum('+i+',\\'einzelpreis\\',this.value,this)"></td>'+
        '<td class="r zeilensumme" data-label="Gesamt">'+(g==null?OFFEN:euro(g))+'</td>'+
        '<td class="c-del"><button class="loeschen" title="Zeile löschen" onclick="loeschen('+i+')">×</button></td>';
      tbody.appendChild(tr);
    });
    // "+ Position hinzufügen" direkt unter dem jeweiligen Abschnitt
    const trNeu = document.createElement('tr');
    trNeu.className='hinzu';
    trNeu.innerHTML = '<td colspan="6"><button class="neu" onclick="neuePosition(\\''+escJs(kat)+'\\')">+ Position'+(mehrere?' unter „'+esc(katName(kat))+'“':'')+' hinzufügen</button></td>';
    tbody.appendChild(trNeu);
    tabelle.appendChild(tbody);
  }
  // Beschreibungs-Textfelder an ihren Inhalt anpassen (mitwachsen).
  tabelle.querySelectorAll('textarea.pos-beschr').forEach(autoWachs);
  summen();
  stickyAktualisieren();
}

// ── Klebende Kategorie-Überschriften (nur Handy) ──────────
// Markiert die aktuell an der Oberkante klebende Überschrift mit der Klasse
// „klebt", die sie im CSS größer/prominenter macht. Erkennung rein über die
// Position: Die unterste Überschrift, deren Oberkante bereits am oberen
// Bildrand (top <= 1) angekommen ist, klebt gerade.
let stickyGeplant = false;
function stickyAktualisieren(){
  stickyGeplant = false;
  const kopfzeilen = document.querySelectorAll('#postab tr.abschnitt td.k-name');
  if(!window.matchMedia('(max-width:640px)').matches){
    kopfzeilen.forEach(td=>td.classList.remove('klebt'));
    return;
  }
  let aktiv = null;
  kopfzeilen.forEach(td=>{ if(td.getBoundingClientRect().top <= 1) aktiv = td; });
  kopfzeilen.forEach(td=>td.classList.toggle('klebt', td===aktiv));
}
function stickyAnstossen(){
  if(stickyGeplant) return;
  stickyGeplant = true;
  requestAnimationFrame(stickyAktualisieren);
}
window.addEventListener('scroll', stickyAnstossen, {passive:true});
window.addEventListener('resize', stickyAnstossen);

/** Textfeld auf seinen Inhalt einstellen — wächst mit, statt abzuschneiden. */
function autoWachs(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }

/** Einheiten-Zelle: Dropdown mit sprechenden Labels + Option „Andere…" für
 *  eine eigene Einheit (Freitext). Ist die aktuelle Einheit nicht in der Liste,
 *  wird „Andere…" vorgewählt und das Freitextfeld gefüllt. */
function einheitZelle(i,wert){
  const bekannt = EINHEITEN.includes(wert);
  const custom = !bekannt && wert!=null && wert!=='';
  let s = '<select class="pos-einheit" onchange="einheitWahl('+i+',this)">';
  for(const e of EINHEITEN){
    s += '<option value="'+esc(e)+'"'+((e===wert)?' selected':'')+'>'+esc(einheitLabel(e))+'</option>';
  }
  s += '<option value="__custom__"'+(custom?' selected':'')+'>Andere…</option>';
  s += '</select>';
  s += '<input class="pos-einheit-custom" placeholder="z. B. Eimer" value="'+(custom?esc(wert):'')+
       '" style="'+(custom?'':'display:none;')+'" oninput="setEinheitCustom('+i+',this.value,this)">';
  return s;
}

/** Auswahl im Einheiten-Dropdown. „Andere…" blendet das Freitextfeld ein
 *  (ohne Neuaufbau, damit der Fokus nicht springt); jede andere Wahl setzt die
 *  Einheit direkt. */
function einheitWahl(i,sel){
  const inp = sel.closest('td').querySelector('.pos-einheit-custom');
  if(sel.value==='__custom__'){
    inp.style.display='';
    positionen[i].einheit = inp.value.trim();
    zeileNeuRechnen(i,sel);
    inp.focus();
  } else {
    positionen[i].einheit = sel.value;
    // „pauschal" = eine Einheit: Menge automatisch auf 1 setzen.
    if(sel.value==='pauschal') positionen[i].menge = 1;
    render(); markiereGeaendert();
  }
}

/** Freitext-Einheit tippen — NICHT neu rendern (sonst Fokusverlust), nur die
 *  betroffene Zeilensumme und die Summen aktualisieren. */
function setEinheitCustom(i,wert,el){
  positionen[i].einheit = wert.trim();
  zeileNeuRechnen(i,el);
}

/** Zeilensumme der Zeile i neu berechnen und Summen unten auffrischen. */
function zeileNeuRechnen(i,el){
  const g = zeilensumme(positionen[i]);
  const zelle = el.closest('tr').querySelector('.zeilensumme');
  if(zelle) zelle.innerHTML = g==null?OFFEN:euro(g);
  summen(); markiereGeaendert();
}

function summen(){
  const kats = kategorien();
  const mehrere = kats.length > 1;
  let html = '';
  let nettoGesamt = 0, alleDa = positionen.length>0;

  for(const kat of kats){
    const eigene = positionen.filter(p=>p.kategorie===kat);
    let netto = 0, voll = eigene.length>0;
    for(const p of eigene){
      const g = zeilensumme(p);
      if(g==null) voll=false; else netto+=g;
    }
    netto = Math.round(netto*100)/100;
    nettoGesamt += netto;
    if(!voll) alleDa = false;
    if(mehrere){
      html += '<div class="z"><span>Zwischensumme '+esc(katName(kat))+'</span><span>'+(voll?euro(netto):OFFEN)+'</span></div>';
    }
  }
  nettoGesamt = Math.round(nettoGesamt*100)/100;
  const mwst = Math.round(nettoGesamt*START.mwstSatz)/100;
  html += '<div class="z"><span>Nettosumme</span><span>'+(alleDa?euro(nettoGesamt):OFFEN)+'</span></div>';
  html += '<div class="z"><span>zzgl. '+START.mwstSatz+' % MwSt.</span><span>'+(alleDa?euro(mwst):OFFEN)+'</span></div>';
  html += '<div class="z gesamt"><span>Gesamt</span><span>'+(alleDa?euro(nettoGesamt+mwst):OFFEN)+'</span></div>';
  document.getElementById('summenBlock').innerHTML = html;
}

function setF(i,feld,wert){ positionen[i][feld]=wert; if(feld==='einheit') render(); else summen(); markiereGeaendert(); }
// WICHTIG: Beim Tippen NICHT die Tabelle neu aufbauen — sonst verliert das
// Eingabefeld nach jedem Zeichen den Fokus. Nur die Zeilensumme der
// betroffenen Zeile und die Summen unten aktualisieren.
function setNum(i,feld,wert,el){
  const t = wert.replace(',','.').trim();
  positionen[i][feld] = t===''?null:(isNaN(parseFloat(t))?null:parseFloat(t));
  // Ändert der Handwerker den Preis von Hand, ist die Herkunft ab jetzt MANUELL
  // (bzw. UNBEKANNT, wenn er ihn leert) — nicht mehr die ursprüngliche KI-Quelle.
  if(feld==='einzelpreis'){
    positionen[i].preisquelle = positionen[i].einzelpreis==null ? 'UNBEKANNT' : 'MANUELL';
    positionen[i].preisStand = null;
    const box = el.closest('tr').querySelector('.hk-box');
    if(box) box.innerHTML = herkunftHtml(positionen[i]);
  }
  const g = zeilensumme(positionen[i]);
  const zelle = el.closest('tr').querySelector('.zeilensumme');
  if(zelle) zelle.innerHTML = g==null?OFFEN:euro(g);
  summen();
  markiereGeaendert();
}
function loeschen(i){ positionen.splice(i,1); render(); markiereGeaendert(); }
function neuePosition(kat){
  // Hinter der letzten Position derselben Kategorie einfügen
  let letzte = -1;
  positionen.forEach((p,i)=>{ if(p.kategorie===kat) letzte=i; });
  // Arbeitsaufwand startet als Pauschale (Stückzahl 1) — der Handwerker trägt
  // nur den Preis ein. Material/eigene Kategorien starten neutral mit m².
  const istLeistung = kat==='LEISTUNG';
  const neue = {kategorie:kat,beschreibung:'',
    menge:istLeistung?1:null, einheit:istLeistung?'pauschal':'m2', einzelpreis:null,
    preisquelle:'UNBEKANNT', vorschlag:false, mengeUnsicher:false};
  if(letzte>=0) positionen.splice(letzte+1,0,neue); else positionen.push(neue);
  render(); markiereGeaendert();
}
function neueKategorie(){
  const feld = document.getElementById('katName');
  const name = feld.value.trim();
  if(!name){ feld.focus(); return; }
  if(kategorien().some(k=>katName(k).toLowerCase()===name.toLowerCase())){
    feld.select(); return; // gibt es schon — nicht doppelt anlegen
  }
  positionen.push({kategorie:name,beschreibung:'',menge:null,einheit:'m2',einzelpreis:null,preisquelle:'UNBEKANNT',vorschlag:false,mengeUnsicher:false});
  feld.value='';
  render(); markiereGeaendert();
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function escJs(s){ return (s||'').replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'"); }

let aenderungsTimer=null;
['kundeName','kundenNummer','kundeStrasse','kundePlzOrt','nummer','datum','objekt','einleitung','schlusstext'].forEach(id=>{
  document.getElementById(id).addEventListener('input',markiereGeaendert);
});
// PLZ-Nachschlag (nur wenn der Knopf da ist, Feature-Flag FEATURE_PLZ_LOOKUP).
const plzBtn=document.getElementById('plzBtn');
if(plzBtn){
  const plzHint=document.getElementById('plzHint');
  const setzeHinweis=(t,c)=>{ if(plzHint){ plzHint.style.color=c||'#6b7280'; plzHint.textContent=t; } };
  plzBtn.addEventListener('click',async()=>{
    const strasse=val('kundeStrasse');
    const ort=val('kundePlzOrt').replace(/^\\s*\\d{5}\\s*/,'').trim();
    if(strasse.length<2||ort.length<2){ setzeHinweis('Bitte erst Straße und Ort eingeben.','#b7791f'); return; }
    plzBtn.disabled=true; const alt=plzBtn.textContent; plzBtn.textContent='…'; setzeHinweis('Suche PLZ …');
    try{
      const r=await fetch('/api/plz?strasse='+encodeURIComponent(strasse)+'&ort='+encodeURIComponent(ort));
      const data=await r.json().catch(()=>({}));
      if(data&&data.plz){
        document.getElementById('kundePlzOrt').value=data.plz+' '+ort;
        markiereGeaendert();
        setzeHinweis('PLZ '+data.plz+' ergänzt.','#3a9d5d');
      } else {
        setzeHinweis('Keine PLZ gefunden, bitte selbst eintragen.','#b7791f');
      }
    }catch(_){
      setzeHinweis('Suche fehlgeschlagen, bitte selbst eintragen.','#b7791f');
    }
    plzBtn.disabled=false; plzBtn.textContent=alt;
  });
}
// Versendet = schreibgeschützt: Eingaben sperren (Export/Ansehen bleibt).
if(START.versendet){ document.body.classList.add('gesperrt'); }
function markiereGeaendert(){
  document.getElementById('status').textContent='Nicht gespeichert';
  document.getElementById('status').style.color='#b7791f';
  clearTimeout(aenderungsTimer);
  aenderungsTimer=setTimeout(speichern,1200);
}

async function speichern(){
  if(START.versendet) return; // schreibgeschützt: Server würde ohnehin 409 liefern
  const daten={
    kundeName:val('kundeName'), kundenNummer:val('kundenNummer'),
    kundeStrasse:val('kundeStrasse'), kundePlzOrt:val('kundePlzOrt'),
    nummer:val('nummer'), datum:val('datum'), objekt:val('objekt'),
    einleitung:val('einleitung'), schlusstext:val('schlusstext'), positionen
  };
  try{
    const r=await fetch('/api/a/'+START.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(daten)});
    if(!r.ok) throw 0;
    const s=document.getElementById('status'); s.textContent='✓ Gespeichert'; s.style.color='#2e7d32';
  }catch(e){
    const s=document.getElementById('status'); s.textContent='Speichern fehlgeschlagen'; s.style.color='#c0392b';
  }
}
function val(id){ return document.getElementById(id).value; }

async function exportieren(format){
  await speichern();
  // Ist der Haken gesetzt, die Datei zusätzlich per E-Mail an den Betrieb senden.
  if(document.getElementById('mailChk').checked){
    if(!MAIL.email){
      mailStatus('Bitte zuerst deine E-Mail-Adresse eintragen und speichern.', '#c0392b');
      mailEingabeZeigen();
      return; // ohne Adresse kein Versand — und auch kein Download, damit der Hinweis auffällt
    }
    try{
      const r = await fetch('/api/a/'+START.token+'/mail.'+format,{method:'POST'});
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.fehler||'Versand fehlgeschlagen');
      mailStatus('📧 Auch per E-Mail an '+MAIL.email+' gesendet.', '#2e7d32');
    }catch(e){
      mailStatus('E-Mail nicht gesendet: '+e.message, '#c0392b');
    }
  }
  window.location.href='/api/a/'+START.token+'/export.'+format;
}

// ── E-Mail-Versand-Bereich ────────────────────────────────
function mailStatus(text,farbe){
  const s=document.getElementById('mailStatus'); s.textContent=text; s.style.color=farbe||'#555';
}
function mailLabelAktualisieren(){
  document.getElementById('mailChkText').textContent =
    MAIL.email ? 'Datei auch als E-Mail an '+MAIL.email+' senden' : 'Datei auch als E-Mail senden';
  document.getElementById('mailAendern').style.display = MAIL.email ? '' : 'none';
}
function mailEingabeZeigen(){
  document.getElementById('mailAdresse').value = MAIL.email||'';
  document.getElementById('mailEingabe').style.display='';
  document.getElementById('mailAdresse').focus();
}
async function mailEinstellungSpeichern(patch){
  // Schreibt E-Mail und/oder Haken-Zustand an den Betrieb.
  const r = await fetch('/api/a/'+START.token+'/mail-einstellung',{
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch)
  });
  if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.fehler||'Speichern fehlgeschlagen'); }
  const j = await r.json();
  MAIL.email = j.email||'';
  return j;
}
async function mailHakenGeaendert(){
  const an = document.getElementById('mailChk').checked;
  if(an && !MAIL.email){ mailEingabeZeigen(); }
  try{ await mailEinstellungSpeichern({aktiv:an}); }
  catch(e){ mailStatus(e.message,'#c0392b'); }
}
async function mailSpeichern(){
  const email=document.getElementById('mailAdresse').value.trim();
  if(!/^.+@.+\\..+$/.test(email)){ mailStatus('Bitte eine gültige E-Mail-Adresse eintragen.','#c0392b'); return; }
  try{
    await mailEinstellungSpeichern({email, aktiv:document.getElementById('mailChk').checked});
    document.getElementById('mailEingabe').style.display='none';
    mailLabelAktualisieren();
    mailStatus('✓ E-Mail gespeichert.','#2e7d32');
  }catch(e){ mailStatus(e.message,'#c0392b'); }
}
function mailInit(){
  const chk=document.getElementById('mailChk');
  if(!chk) return; // Test-Konto: Export/Mail-Bereich ist gesperrt, nichts zu tun
  chk.checked = !!MAIL.standard;
  mailLabelAktualisieren();
  // Haken gesetzt, aber noch keine Adresse? Direkt Eingabe anbieten.
  if(MAIL.standard && !MAIL.email) mailEingabeZeigen();
}

mailInit();
render();
</script>
</body>
</html>`;
}
