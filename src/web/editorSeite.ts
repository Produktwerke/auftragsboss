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
  /** Preisgedächtnis-Stand für die Merken/Vergessen-Knöpfe je Position:
   *  Leistungs-Schlüssel → gemerkter Preis. Null/undefined = Funktion aus
   *  (Flag oder Betriebseinstellung), die Knöpfe erscheinen dann nicht. */
  gedaechtnis?: Record<string, number> | null;
}): string {
  const { dokument, preisliste, einstellungenUrl, handwerker, plzLookup, gedaechtnis } = args;
  const b = preisliste.betrieb;
  const akzent = `#${/^[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe : "0B5CAD"}`;
  const logo = ladeLogo(b.logo);
  const positionen = JSON.parse(dokument.positionenJson) as EingabePosition[];
  const istAngebot = dokument.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Protokoll";

  // Datum als YYYY-MM-DD für das date-Eingabefeld
  const datumIso = dokument.datum.toISOString().slice(0, 10);

  // Fußzeile der Live-Vorschau — gleicher Aufbau wie in Word/PDF (zweizeilig).
  const fussZ1 = [
    [b.firma, b.strasse, `${b.plz} ${b.ort}`.trim()].filter(Boolean).join(", "),
    ...(b.inhaber ? [`Ansprechpartner: ${b.inhaber}`] : []),
  ].join("   ·   ");
  const fussZ2 = [
    b.ustIdNr ? `USt-IdNr.: ${b.ustIdNr}` : "",
    b.bank ? `Bank: ${b.bank}` : "",
    b.iban ? `IBAN: ${b.iban}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");

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
  .rahmen { max-width: 1500px; margin: 0 auto; padding: 16px; }
  /* Zwei Spalten am Desktop: links der Editor, rechts die klebende
     A4-Live-Vorschau. Unter 1100px verschwindet die Vorschau komplett
     (Handy/Tablet), die Editor-Spalte bleibt wie gewohnt mittig. */
  .editor-layout { display:grid; grid-template-columns:minmax(0,860px) minmax(340px,560px);
                   gap:26px; justify-content:center; align-items:start; }
  .editor-spalte { width:100%; max-width:860px; margin:0 auto; min-width:0; }
  /* Die Vorschau ist maximal so hoch wie der Bildschirm und in sich selbst
     scrollbar — bei langen Angeboten scrollt man MIT DEM MAUSRAD ÜBER DER
     VORSCHAU unabhängig vom Editor links (overscroll-behavior verhindert,
     dass am Ende die ganze Seite weiterscrollt). */
  .doc-seite { position:sticky; top:14px; min-width:0; max-height:calc(100vh - 28px);
               overflow-y:auto; overscroll-behavior:contain; padding-right:6px;
               scrollbar-width:thin; scrollbar-color:#b9c1c9 transparent; }
  .doc-seite::-webkit-scrollbar { width:9px; }
  .doc-seite::-webkit-scrollbar-thumb { background:#b9c1c9; border-radius:5px; }
  .doc-seite::-webkit-scrollbar-track { background:transparent; }
  .doc-label { font-size:11.5px; font-weight:700; text-transform:uppercase;
               letter-spacing:.06em; color:#8a919a; margin:2px 0 10px; }
  @media (max-width:1099px){ .editor-layout{ display:block; } .doc-seite{ display:none; } }
  /* Das Vorschau-Dokument selbst (nur hier eigene Tabellen-Optik — die
     globalen th/td-Regeln des Editors werden gezielt überschrieben). */
  .doc { background:#fff; border-radius:12px; box-shadow:0 10px 30px rgba(16,24,40,.14);
         padding:26px 26px 20px; color:#222; }
  .doc .d-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
                 border-bottom:3px solid var(--akzent); padding-bottom:13px; }
  .doc .d-firma { font-size:19px; font-weight:800; color:var(--akzent); line-height:1.15; }
  .doc .d-adr { font-size:11.5px; color:#666; margin-top:5px; line-height:1.5; }
  .doc .d-logo img { max-height:52px; max-width:150px; object-fit:contain; }
  .doc .d-meta { display:flex; justify-content:space-between; gap:16px; margin-top:15px;
                 font-size:11.5px; color:#444; line-height:1.5; }
  .doc .d-nr { text-align:right; color:#555; white-space:nowrap; }
  .doc .d-titel { font-size:16px; font-weight:800; margin:15px 0 2px; color:#222; }
  .doc .d-objekt { font-size:11.5px; color:#555; margin-bottom:4px; }
  .doc .d-text { font-size:11.5px; color:#333; white-space:pre-wrap; margin:7px 0; line-height:1.55; }
  .doc table { width:100%; min-width:0; border-collapse:collapse; margin:9px 0; }
  .doc th { background:none; text-align:left; font-size:10px; text-transform:uppercase;
            letter-spacing:.04em; color:#8a9099; border-bottom:1px solid #d7dae0;
            padding:0 6px 5px 0; font-weight:700; }
  /* Rechte Spalten: Luft ZWISCHEN den Zahlenspalten (sonst klebt "pauschal"
     am Einzelpreis und "Gesamtbetrag" am Betrag); nur die letzte Spalte
     schließt bündig mit dem Blattrand ab. */
  .doc th.r, .doc td.r { text-align:right; padding-right:14px; white-space:nowrap; }
  .doc th:last-child, .doc td:last-child { padding-right:0; }
  .doc td { padding:6px 6px 6px 0; border-bottom:1px solid #eef1f3; font-size:11.5px; color:#333; vertical-align:top; }
  .doc tr.kat td { font-weight:700; color:#444; padding-top:10px; }
  .doc tr.sum td { border:none; padding:3px 14px 3px 0; color:#444; }
  .doc tr.sum td:last-child { padding-right:0; }
  .doc tr.sum.erste td { padding-top:9px; }
  .doc tr.ges td { font-weight:800; color:var(--akzent); border-top:2px solid var(--akzent);
                   border-bottom:none; padding-top:7px; }
  .doc .offen { font-size:11.5px; }
  .doc .d-gueltig { font-size:10.5px; color:#666; margin-top:11px; }
  .doc .d-fuss { font-size:9.5px; color:#8a8a8a; margin-top:15px; padding-top:9px;
                 border-top:1px solid #eceff2; line-height:1.6; }
  .doc-note { font-size:12px; color:#98a0a8; margin:12px 2px 0; line-height:1.5; }
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
  /* Untere Leiste: zwei aufgeräumte Gruppen — "Angebot herunterladen" und
     "Am PC weitermachen" — nebeneinander (Desktop) bzw. untereinander (Handy). */
  .akt-spalten { display:flex; gap:22px; align-items:stretch; }
  .akt-gruppe { flex:1; min-width:0; }
  .akt-trenner { width:1px; background:#e8ebee; }
  .akt-titel { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
               color:#8a919a; margin-bottom:9px; display:flex; align-items:center; }
  .akt-titel .status { text-transform:none; letter-spacing:0; font-size:12.5px; }
  .akt-knoepfe { display:flex; gap:10px; }
  .akt-knoepfe .btn { flex:1; padding:12px 14px; font-size:15px; font-weight:700; }
  .aktionen label.chk { display:flex; align-items:center; gap:8px; font-size:14px;
         font-weight:600; color:#444; margin:12px 0 0; cursor:pointer; }
  .aktionen label.chk input { width:auto; }
  .mail-eingabe { margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .mail-eingabe input { width:auto; flex:1; min-width:180px; max-width:320px; }
  .mail-aendern { background:none; border:none; color:var(--akzent); font-size:13px;
         cursor:pointer; text-decoration:underline; padding:0; }
  .mail-status { font-size:13px; margin-top:6px; }
  .mail-tipp { font-size:13px; color:#66707a; margin-top:6px; line-height:1.5; }
  .mail-link-btn { width:100%; background:none; border:1px solid #cbd2da; border-radius:8px;
                   padding:11px 12px; font-size:13.5px; font-weight:600; color:#333; cursor:pointer; }
  .mail-link-btn:hover { background:#f2f4f6; }
  .mail-link-btn:disabled { opacity:.6; cursor:default; }
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
  /* Anfasser zum Verschieben der Positionen (Drag & Drop, Desktop) */
  .k-griffkopf { width:26px; }
  td.c-griff { width:26px; padding:6px 0 6px 2px; text-align:center; }
  .griff { cursor:grab; color:#b3bcc4; font-size:15px; user-select:none; display:inline-block; padding:2px 4px; }
  .griff:hover { color:#5a6570; }
  .griff:active { cursor:grabbing; }
  tr.dragging { opacity:.35; }
  tr.drag-oben td { border-top:2px solid var(--akzent); }
  tr.drag-unten td { border-bottom:2px solid var(--akzent); }
  tr.drag-ziel td { outline:2px dashed var(--akzent); outline-offset:-2px; }
  /* Auswahl-Häkchen zum Zusammenfassen mehrerer Positionen */
  .k-wahlkopf { width:30px; }
  td.c-wahl { width:30px; padding:6px 0 6px 6px; text-align:center; }
  input.wahl { width:17px; height:17px; margin:0; cursor:pointer; accent-color:var(--akzent); vertical-align:middle; }
  .wahl-mob-box { display:none; }
  /* Leiste über den Positionen — erscheint, sobald etwas ausgewählt ist */
  .wahl-leiste { display:none; align-items:center; gap:10px; flex-wrap:wrap;
    background:#eef4fb; border:1px solid #c9d9ec; border-radius:9px;
    padding:9px 12px; margin:10px 0 2px; font-size:13.5px; color:#2c3e50; }
  .wahl-leiste.an { display:flex; }
  .wahl-leiste.undo { background:#eef7ee; border-color:#bcd9c2; }
  .wahl-btn { background:var(--akzent); color:#fff; border:none; border-radius:8px;
    padding:8px 13px; font-size:13.5px; font-weight:700; cursor:pointer; }
  .wahl-btn:hover { filter:brightness(1.08); }
  .wahl-btn:disabled { opacity:.5; cursor:default; }
  .wahl-weg { background:none; border:none; color:#5a6570; text-decoration:underline;
    cursor:pointer; font-size:13px; padding:0; }
  .wahl-hint { font-size:12.5px; color:#5a6570; }
  /* ▲/▼-Verschiebeknöpfe: nur auf dem Handy sichtbar (Desktop zieht am Anfasser) */
  .pfeile { display:none; }
  /* Verschobene Zeile blinkt kurz auf (nach ▲/▼ oder Drag & Drop) */
  tr.bewegt td { animation: bewegtflash .8s ease; }
  @keyframes bewegtflash { 0% { background:#fff3bf; } 100% { background:transparent; } }
  /* Gelöschte Position: bleibt kurz als graue Rückgängig-Zeile stehen und
     blendet zum Ende der Frist von selbst aus (die Entfernung macht das JS). */
  tr.geloescht-zeile td { color:#98a0a8; background:#f6f7f9; font-size:14px; }
  tr.geloescht-zeile { animation: gelfade 8s forwards; }
  @keyframes gelfade { 0%,75% { opacity:1; } 100% { opacity:.12; } }
  .gel-name { text-decoration:line-through; }
  .gel-undo { background:none; border:none; color:var(--akzent); font-weight:600; cursor:pointer;
              text-decoration:underline; padding:0; font-size:14px; }
  .gel-undo:hover { filter:brightness(.8); }
  /* z-index über den klebenden Kategorie-Überschriften (z-index:5), damit die
     Überschriften beim Scrollen HINTER dieser unteren Leiste verschwinden,
     nicht darüber. */
  .aktionen { position:sticky; bottom:0; z-index:20; background:#fff; border-radius:12px; padding:14px 16px;
              box-shadow:0 -2px 10px rgba(0,0,0,.08); }
  /* Untere Leiste: am Handy zuklappbar (Kopfzeile antippen); öffnet sich von
     selbst, wenn man ganz unten angekommen ist. Am Desktop immer offen. */
  .akt-kopf { display:none; }
  @media (max-width:640px){
    .akt-kopf { display:flex; align-items:center; gap:10px; font-size:14.5px; font-weight:700;
                color:#333; cursor:pointer; user-select:none; padding:4px 2px; }
    .akt-kopf .akt-status { margin-left:auto; font-size:12.5px; font-weight:600; }
    /* Großer, gut treffbarer Auf-/Zuklapp-Knopf (die ganze Kopfzeile ist
       klickbar — der Knopf macht das nur deutlich sichtbar). */
    .akt-kopf .akt-caret { flex:0 0 auto; width:42px; height:40px; display:flex;
                align-items:center; justify-content:center; font-size:20px; color:#5a6570;
                background:#f2f4f7; border:1px solid #dfe4e9; border-radius:10px;
                transition:transform .2s ease; }
    .aktionen.zu .akt-caret { transform:rotate(180deg); }
    .aktionen.zu .akt-inhalt { display:none; }
    .aktionen .akt-inhalt { margin-top:10px; }
    .aktionen .akt-inhalt .status { display:none; } /* Status steht mobil in der Kopfzeile */
    .aktionen { padding:10px 14px; }
    .akt-spalten { flex-direction:column; gap:14px; }
    .akt-trenner { width:auto; height:1px; }
  }
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
    /* Positions-Karte: aufgeräumtes Raster — Beschreibung oben, darunter
       Menge+Einheit und Einzelpreis+Gesamt paarweise nebeneinander, unten
       eine Fußleiste mit Verschieben / Merken / Löschen. */
    #postab tr.pos-zeile{
      display:grid; grid-template-columns:1fr 1fr;
      grid-template-areas:"beschr beschr" "menge einheit" "preis gesamt" "fuss fuss";
      column-gap:12px; row-gap:10px;
      background:#fff; border:1px solid #e3e7ea; border-radius:12px;
      padding:12px 12px 10px; margin:0 0 12px;
      box-shadow:0 1px 3px rgba(16,24,40,.06);
    }
    #postab tr.pos-zeile td{ display:block; border-bottom:none; padding:0; text-align:left; }
    /* Anfasser mobil ausblenden — Ziehen per Finger ist unzuverlässig, dafür ▲/▼ */
    #postab tr.pos-zeile td.c-griff{ display:none; }
    /* Auswahl-Leiste klebt auf dem Handy oben im Sichtfeld, sobald etwas
       ausgewählt ist — so versteht man die Häkchen sofort und muss zum
       Zusammenfassen-Knopf nicht hochscrollen. z-index über den klebenden
       Kategorie-Bannern (5), die schieben sich beim Scrollen darunter durch. */
    .wahl-leiste.an{ position:sticky; top:8px; z-index:6;
      box-shadow:0 5px 16px rgba(16,24,40,.22); }
    .wahl-leiste .wahl-btn{ flex:1 0 100%; padding:11px 12px; }
    /* Auswahl-Häkchen mobil: nicht als eigene Spalte, sondern in der Fußleiste */
    #postab tr.pos-zeile td.c-wahl{ display:none; }
    #postab tr.pos-zeile td.c-del .wahl-mob-box{ display:flex; align-items:center; justify-content:center;
      width:44px; height:38px; border:1px solid #dfe4e9; border-radius:10px; background:#f7f8fa; cursor:pointer; }
    #postab tr.pos-zeile td.c-del .wahl-mob-box input.wahl{ width:19px; height:19px; }
    #postab tr.pos-zeile td.c-beschr{ grid-area:beschr; }
    #postab tr.pos-zeile td.c-menge{ grid-area:menge; }
    #postab tr.pos-zeile td.c-einheit{ grid-area:einheit; }
    #postab tr.pos-zeile td.c-preis{ grid-area:preis; }
    #postab tr.pos-zeile td.zeilensumme{ grid-area:gesamt; }
    #postab tr.pos-zeile td.c-del{ grid-area:fuss; }
    /* kleine Feldlabels ÜBER den Eingaben (statt daneben) */
    #postab tr.pos-zeile td[data-label]::before{
      content:attr(data-label); display:block; color:#8a919a; font-size:11px;
      font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px;
    }
    #postab tr.pos-zeile .pos-beschr{ width:100%; font-size:15px; }
    #postab tr.pos-zeile .pos-menge, #postab tr.pos-zeile .pos-einheit,
    #postab tr.pos-zeile .pos-preis{ width:100%; }
    #postab tr.pos-zeile .hk-box{ margin-top:6px; }
    /* Gesamt: ruhiger Wert rechtsbündig, auf Höhe des Einzelpreis-Felds */
    #postab tr.pos-zeile td.zeilensumme{
      display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between;
      font-size:17px; font-weight:700;
    }
    /* Fußleiste der Karte: ▲/▼ links, Merken-Knopf daneben, Löschen rechts */
    #postab tr.pos-zeile td.c-del{
      display:flex; align-items:center; gap:8px; flex-wrap:wrap;
      border-top:1px solid #eef1f3; padding-top:10px; margin-top:2px;
    }
    #postab tr.pos-zeile td.c-del .pfeile{ display:flex; gap:8px; }
    .pfeil{ background:#f7f8fa; border:1px solid #dfe4e9; border-radius:10px;
            width:44px; height:38px; font-size:15px; color:#444; cursor:pointer; line-height:1; }
    .pfeil:active{ background:#e2e8ee; }
    #postab tr.pos-zeile td.c-del .loeschen{
      width:42px; height:38px; flex:0 0 auto; margin-left:auto; font-size:20px; line-height:1;
      background:#fdf6f5; border:1px solid #f0dbd7; border-radius:10px; padding:0;
    }
    /* Merken/Vergessen auf dem Handy: in der Fußleiste (unter dem Preis) —
       hält die Beschreibung oben frei. Doppelklasse nötig: die .ged-box-
       Basisregel steht NACH diesem Media-Block im Stylesheet und würde bei
       gleicher Spezifität gewinnen. */
    .ged-box.ged-desk{ display:none; }
    #postab tr.pos-zeile td.c-del .ged-mob{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    #postab tr.pos-zeile td.c-del .ged-mob:empty{ display:none; }
    /* Merken-Knopf als runde, gut tippbare Pille */
    #postab .ged-btn{ padding:6px 12px; font-size:12.5px; border-radius:999px; }
    /* Eigene Einheit ("Andere…"): Freitextfeld unter dem Dropdown, volle Breite */
    #postab tr.pos-zeile td.c-einheit .pos-einheit-custom{ width:100%; max-width:none; margin-top:6px; }
    /* Gerade gelöschte Position: schmale graue Rückgängig-Karte */
    #postab tr.geloescht-zeile{
      display:flex; align-items:center; gap:8px;
      background:#f6f7f9; border:1px solid #e3e7ea; border-radius:12px;
      padding:10px 12px; margin:0 0 12px;
    }
    #postab tr.geloescht-zeile td{ display:block; border-bottom:none; padding:0; background:none; }
    #postab tr.geloescht-zeile td.gel-td{ flex:1; }
    /* "+ Position hinzufügen" als luftiger Knopf */
    #postab tr.hinzu .neu{ padding:11px; border-radius:10px; }
  }
  /* Herkunfts-Etiketten je Zeile (woher der Preis kommt) */
  .hk-box{ margin-top:3px; line-height:1; }
  .hk{ display:inline-block; font-size:11px; line-height:1.4; padding:1px 8px; border-radius:10px; font-weight:600; }
  .hk-vor{ background:#fff3e0; color:#b7791f; }
  .hk-ged{ background:#e8f0fe; color:#1a56c4; }
  .hk-dik{ background:#eef2f5; color:#5a636b; }
  .hk-lst{ background:#eef7ee; color:#2e7d32; }
  .hk-man{ background:#f0f0f2; color:#555; }
  /* Preisgedächtnis: Merken/Vergessen-Knöpfe je Position */
  .ged-box{ margin-top:4px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .ged-box:empty{ display:none; }
  .ged-btn{ background:#f2f6fb; border:1px solid #c9d6e8; color:#1a56c4; border-radius:10px;
            padding:2px 9px; font-size:11.5px; font-weight:600; cursor:pointer; line-height:1.5; }
  .ged-btn:hover{ background:#e3edf9; }
  .ged-weg{ background:none; border:none; color:#8a939c; text-decoration:underline; padding:2px 0; }
  .ged-weg:hover{ background:none; color:#c0392b; }
  .ged-ok{ font-size:11.5px; font-weight:600; color:#2e7d32; }
  .ged-err{ font-size:11.5px; color:#c0392b; }
  /* Desktop: rechtsbündig unter dem Einzelpreis-Feld */
  .ged-desk{ justify-content:flex-end; text-align:right; }
  /* Handy-Variante der Knopf-Box (in der Kreuzchen-Zeile) — nur mobil sichtbar */
  .ged-mob{ display:none; }
  /* Test-Angebot: Export gesperrt, Hinweis auf WhatsApp */
  .btn.locked{ opacity:.5; cursor:not-allowed; }
  /* Versendet = schreibgeschützt: Eingaben gesperrt, Export bleibt möglich */
  .gesperrt input, .gesperrt textarea, .gesperrt select,
  .gesperrt .neu, .gesperrt .loeschen, .gesperrt .ged-btn, .gesperrt .griff, .gesperrt .pfeil { pointer-events:none; opacity:.55; }
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
<div class="editor-layout">
<div class="editor-spalte">

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
    <div class="wahl-leiste" id="wahlLeiste"></div>
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
    <div class="akt-kopf" id="aktKopf">📄 Herunterladen<span class="akt-status" id="aktKopfStatus"></span><span class="akt-caret">▾</span></div>
    <div class="akt-inhalt">
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
    </div>
  </div>`
      : `<div class="aktionen">
    <div class="akt-kopf" id="aktKopf">📄 Herunterladen &amp; E-Mail<span class="akt-status" id="aktKopfStatus"></span><span class="akt-caret">▾</span></div>
    <div class="akt-inhalt">
    <div class="akt-spalten">
      <div class="akt-gruppe">
        <div class="akt-titel">Angebot herunterladen<span class="status" id="status"></span></div>
        <div class="akt-knoepfe">
          <button class="btn" onclick="exportieren('pdf')">📄 PDF</button>
          <button class="btn" onclick="exportieren('word')">📝 Word</button>
        </div>
        <label class="chk"><input type="checkbox" id="mailChk" onchange="mailHakenGeaendert()">
          <span id="mailChkText">Datei auch als E-Mail senden</span></label>
        <button class="mail-aendern" id="mailAendern" type="button" onclick="mailEingabeZeigen()" style="display:none;">E-Mail-Adresse ändern</button>
        <div class="mail-eingabe" id="mailEingabe" style="display:none;">
          <input id="mailAdresse" type="email" inputmode="email" placeholder="deine@firma.de">
          <button class="btn" onclick="mailSpeichern()">Speichern</button>
        </div>
      </div>
      <div class="akt-trenner"></div>
      <div class="akt-gruppe">
        <div class="akt-titel">💻 Am PC weitermachen</div>
        <button class="mail-link-btn" id="mailLinkBtn" type="button" onclick="linkMailSenden()">📧 Bearbeitungslink an meine E-Mail senden</button>
        <div class="mail-tipp">Die E-Mail enthält deinen <b>Bearbeitungslink</b> — so machst du das Angebot später am Rechner in Ruhe fertig.</div>
      </div>
    </div>
    <div class="mail-status" id="mailStatus"></div>
    </div>
  </div>`
  }

</div><!-- /editor-spalte -->

<aside class="doc-seite">
  <div class="doc-label">Vorschau</div>
  <div class="doc">
    <div class="d-head">
      <div>
        <div class="d-firma">${escapeHtml(b.firma)}</div>
        <div class="d-adr">${escapeHtml([b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon].filter(Boolean).join(" · "))}</div>
      </div>
      ${logo ? `<div class="d-logo"><img src="${logo.dataUrl}" alt="Logo"></div>` : ""}
    </div>
    <div class="d-meta">
      <div id="pvKunde"></div>
      <div class="d-nr" id="pvMeta"></div>
    </div>
    <div class="d-titel">${escapeHtml(titel)}</div>
    <div class="d-objekt" id="pvObjekt"></div>
    <div class="d-text" id="pvEinleitung"></div>
    <table>
      <thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Gesamt</th></tr></thead>
      <tbody id="pvPositionen"></tbody>
    </table>
    <div class="d-text" id="pvSchluss"></div>
    ${istAngebot ? `<div class="d-gueltig" id="pvGueltig"></div>` : ""}
    ${fussZ1 || fussZ2 ? `<div class="d-fuss">${[fussZ1, fussZ2].filter(Boolean).map(escapeHtml).join("<br>")}</div>` : ""}
  </div>
  <p class="doc-note">Live-Vorschau deines Angebots — ändert sich sofort beim Tippen. PDF und Word sehen genauso aus.</p>
</aside>

</div><!-- /editor-layout -->
</div>

<script>
const START = ${JSON.stringify(startDaten)};
const EINHEITEN = ${JSON.stringify(EINHEITEN)};
const MAIL = ${JSON.stringify({ email: handwerker.email ?? "", standard: handwerker.mailStandard })};
// Preisgedächtnis-Stand für die Merken/Vergessen-Knöpfe je Position.
// aktiv=false (Flag oder Betriebseinstellung aus) blendet alles aus.
const GED = ${JSON.stringify({ aktiv: !!gedaechtnis, preise: gedaechtnis ?? {} })};
// Konditionen für die "Gültig bis … Zahlungsziel: …"-Zeile der Live-Vorschau
// (bereits mit den Betriebs-Einstellungen überlagert).
const KOND = ${JSON.stringify({ tage: preisliste.konditionen.angebotGueltigTage, zahlungsziel: preisliste.konditionen.zahlungsziel })};
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
  preisStand: p.preisStand || null,
  // Sperre fürs Automatik-Lernen: bewusst "vergessene" Preise bleiben vergessen.
  gedSperre: !!p.gedSperre
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

// ── Preisgedächtnis: Merken/Vergessen je Position ─────────
// Der Handwerker entscheidet gezielt, welcher Einheitspreis (Stundensatz,
// m²-Preis, Gebinde-Preis …) ins Gedächtnis wandert — und sieht umgekehrt
// sofort, wenn ein Preis bereits gemerkt ist, inklusive "vergessen"-Knopf.

// Muss der Server-Normalisierung leistungSchluessel() entsprechen
// (betrieb/preisgedaechtnis.ts) — sonst erkennen sich die Einträge nicht.
function gedSchluessel(beschreibung,einheit){
  const norm=(beschreibung||'').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/ +/g,' ');
  return norm+'|'+((einheit==null?'':einheit)+'').toLowerCase();
}
// Sprechende Beschriftung je Einheit: "Stundensatz merken" statt nur "Preis merken".
function gedLabel(einheit){
  switch(einheit){
    case 'Std': return 'Stundensatz';
    case 'm2': return 'm²-Preis';
    case 'pauschal': return 'Pauschalpreis';
    case 'Stk': return 'Stückpreis';
    case 'lfm': return 'lfm-Preis';
    case 'l': return 'Literpreis';
    case 'kg': return 'Kilopreis';
    case 'Sack': return 'Sackpreis';
    case 'Gebinde': return 'Gebinde-Preis';
    case 'Rolle': return 'Rollenpreis';
    default: return 'Preis';
  }
}
function gedHtml(p,i){
  if(!GED.aktiv || !(p.beschreibung||'').trim()) return '';
  const key = gedSchluessel(p.beschreibung,p.einheit);
  const label = gedLabel(p.einheit);
  if(Object.prototype.hasOwnProperty.call(GED.preise,key)){
    const alt = GED.preise[key];
    const abweichend = p.einzelpreis!=null && Math.abs(alt-p.einzelpreis)>=0.005;
    const teil = abweichend
      ? '<button type="button" class="ged-btn" onclick="gedMerken('+i+')">🧠 Neuen '+esc(label)+' merken (bisher '+euro(alt)+')</button>'
      : '<span class="ged-ok">✓ '+esc(label)+' gemerkt'+(p.einzelpreis==null?' ('+euro(alt)+')':'')+'</span>';
    return teil+'<button type="button" class="ged-btn ged-weg" title="Diesen Preis aus dem Gedächtnis entfernen" onclick="gedVergessen('+i+')">vergessen</button>';
  }
  if(p.einzelpreis==null) return '';
  return '<button type="button" class="ged-btn" onclick="gedMerken('+i+')">🧠 '+esc(label)+' merken</button>';
}
// Jede Zeile hat ZWEI Knopf-Boxen (Desktop: unter der Beschreibung, Handy:
// in der Zeile mit dem Lösch-Kreuzchen) — CSS blendet je Ansicht eine aus,
// aktualisiert werden immer beide.
function gedBoxen(i){ return document.querySelectorAll('.ged-box[data-i="'+i+'"]'); }
function gedAktualisieren(i){
  gedBoxen(i).forEach(box=>{ box.innerHTML=gedHtml(positionen[i],i); });
}
// Alle Zeilen auffrischen — mehrere können denselben Schlüssel teilen
// (z. B. zweimal "Meisterstunden"), darum nicht nur die eine Zeile.
function gedAlle(){ positionen.forEach((_,idx)=>gedAktualisieren(idx)); }
function gedFehler(i,text){
  gedBoxen(i).forEach(box=>{ box.innerHTML=gedHtml(positionen[i],i)+'<span class="ged-err">'+esc(text)+'</span>'; });
}
async function gedMerken(i){
  const p=positionen[i];
  if(p.einzelpreis==null) return;
  try{
    const r=await fetch('/api/a/'+START.token+'/preis-merken',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({beschreibung:p.beschreibung,einheit:p.einheit,einzelpreis:p.einzelpreis})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.fehler||'Merken fehlgeschlagen.');
    GED.preise[gedSchluessel(p.beschreibung,p.einheit)]=p.einzelpreis;
    // Merken hebt eine frühere "vergessen"-Sperre wieder auf.
    if(p.gedSperre){ p.gedSperre=false; markiereGeaendert(); }
    gedAlle();
  }catch(e){ gedFehler(i,e.message); }
}
async function gedVergessen(i){
  const p=positionen[i];
  try{
    const r=await fetch('/api/a/'+START.token+'/preis-vergessen',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({beschreibung:p.beschreibung,einheit:p.einheit})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.fehler||'Vergessen fehlgeschlagen.');
    delete GED.preise[gedSchluessel(p.beschreibung,p.einheit)];
    // Sperre setzen, sonst würde das Automatik-Lernen beim nächsten
    // Speichern den noch eingetragenen Preis sofort wieder merken.
    if(!p.gedSperre){ p.gedSperre=true; markiereGeaendert(); }
    gedAlle();
  }catch(e){ gedFehler(i,e.message); }
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
      '<td class="k-sp k-wahlkopf"></td>'+
      '<td class="k-sp k-griffkopf"></td>'+
      '<td class="k-name">'+esc(katName(kat))+'</td>'+
      '<td class="r k-sp">Menge</td>'+
      '<td class="k-sp">Einheit</td>'+
      '<td class="r k-sp">Einzelpreis</td>'+
      '<td class="r k-sp">Gesamt</td>'+
      '<td class="k-sp"></td>';
    tbody.appendChild(trK);
    positionen.forEach((p,i)=>{
      if(p.kategorie!==kat) return;
      // Gerade gelöschte Zeile: graue Rückgängig-Zeile statt Eingabefeldern.
      if(p._geloescht){
        const trG = document.createElement('tr');
        trG.className='geloescht-zeile';
        trG.dataset.i = i; // fürs Wiederfinden nach dem Neuaufbau (Schrumpf-Animation)
        trG.innerHTML =
          '<td colspan="7" class="gel-td"><span class="gel-name">'+esc(p.beschreibung||'Position')+'</span>'+
          ' gelöscht — <button type="button" class="gel-undo" onclick="wiederherstellen('+i+')">Rückgängig</button></td>'+
          '<td class="c-del"><button class="loeschen" title="Sofort endgültig entfernen" onclick="endgueltigLoeschen('+i+')">×</button></td>';
        tbody.appendChild(trG);
        return;
      }
      const g = zeilensumme(p);
      const tr = document.createElement('tr');
      tr.className = 'pos-zeile';
      tr.innerHTML =
        '<td class="c-wahl"><input type="checkbox" class="wahl" '+(p._wahl?'checked ':'')+'title="Zum Zusammenfassen auswählen" onchange="wahlSetzen('+i+',this.checked)"></td>'+
        '<td class="c-griff"><span class="griff" title="Ziehen, um die Position zu verschieben">⠿</span></td>'+
        '<td class="c-beschr" data-label="Beschreibung"><textarea class="pos-beschr" rows="1" oninput="setF('+i+',\\'beschreibung\\',this.value); autoWachs(this); gedAktualisieren('+i+')">'+esc(p.beschreibung)+'</textarea><div class="hk-box">'+herkunftHtml(p)+'</div></td>'+
        '<td class="r c-menge" data-label="Menge"><input class="pos-menge r" inputmode="decimal" value="'+(p.menge??'')+'" oninput="setNum('+i+',\\'menge\\',this.value,this)"></td>'+
        '<td class="c-einheit" data-label="Einheit">'+einheitZelle(i,p.einheit)+'</td>'+
        '<td class="r c-preis" data-label="Einzelpreis"><input class="pos-preis r" inputmode="decimal" value="'+(p.einzelpreis??'')+'" placeholder="___" oninput="setNum('+i+',\\'einzelpreis\\',this.value,this)"><div class="ged-box ged-desk" data-i="'+i+'">'+gedHtml(p,i)+'</div></td>'+
        '<td class="r zeilensumme" data-label="Gesamt">'+(g==null?OFFEN:euro(g))+'</td>'+
        '<td class="c-del"><label class="wahl-mob-box" title="Zum Zusammenfassen auswählen"><input type="checkbox" class="wahl" '+(p._wahl?'checked ':'')+'onchange="wahlSetzen('+i+',this.checked)"></label><span class="pfeile"><button type="button" class="pfeil" title="Nach oben verschieben" onclick="verschiebePosition('+i+',-1)">▲</button><button type="button" class="pfeil" title="Nach unten verschieben" onclick="verschiebePosition('+i+',1)">▼</button></span><div class="ged-box ged-mob" data-i="'+i+'">'+gedHtml(p,i)+'</div><button class="loeschen" title="Zeile löschen" onclick="loeschen('+i+')">×</button></td>';
      tr.dataset.i = i; // fürs Wiederfinden nach dem Neuaufbau (Bewegungs-Animation)
      dragVerdrahten(tr, p);
      tbody.appendChild(tr);
    });
    // "+ Position hinzufügen" direkt unter dem jeweiligen Abschnitt — auch
    // Ablageziel beim Ziehen ("ans Ende dieser Kategorie").
    const trNeu = document.createElement('tr');
    trNeu.className='hinzu';
    trNeu.innerHTML = '<td colspan="8"><button class="neu" onclick="neuePosition(\\''+escJs(kat)+'\\')">+ Position'+(mehrere?' unter „'+esc(katName(kat))+'“':'')+' hinzufügen</button></td>';
    dragZielKategorieEnde(trNeu, kat);
    tbody.appendChild(trNeu);
    tabelle.appendChild(tbody);
  }
  // Beschreibungs-Textfelder an ihren Inhalt anpassen (mitwachsen).
  tabelle.querySelectorAll('textarea.pos-beschr').forEach(autoWachs);
  summen();
  stickyAktualisieren();
  wahlLeisteAktualisieren();
}

// ── Mehrere Positionen zu EINER Pauschal-Position zusammenfassen ─
// Viele Betriebe bieten nicht fein aufgedröselt an, sondern 2-3 große
// Positionen mit Pauschalpreis. Die KI dröselt bewusst fein auf (sicherer
// Ausgangspunkt) — hier fasst der Handwerker mit zwei Klicks zusammen.
let wahlUndoVorher = null;   // Positions-Reihenfolge vor dem Zusammenfassen
let wahlUndoTimer = null;

function wahlSetzen(i, an){
  positionen[i]._wahl = an;
  // Desktop- und Handy-Häkchen derselben Zeile synchron halten.
  document.querySelectorAll('#postab tr.pos-zeile[data-i="'+i+'"] input.wahl')
    .forEach(c=>{ c.checked = an; });
  wahlLeisteAktualisieren();
}
function wahlAufheben(){
  positionen.forEach(p=>{ delete p._wahl; });
  document.querySelectorAll('#postab input.wahl').forEach(c=>{ c.checked = false; });
  wahlLeisteAktualisieren();
}
function wahlLeisteAktualisieren(){
  const leiste = document.getElementById('wahlLeiste');
  if(!leiste) return;
  const anzahl = positionen.filter(p=>p._wahl && !p._geloescht).length;
  if(anzahl === 0){
    // Ohne Auswahl bleibt eine evtl. laufende Rückgängig-Anzeige stehen.
    if(!leiste.classList.contains('undo')) leiste.classList.remove('an');
    return;
  }
  clearTimeout(wahlUndoTimer);
  leiste.classList.remove('undo');
  leiste.classList.add('an');
  leiste.innerHTML =
    '<span><b>'+anzahl+'</b> Position'+(anzahl===1?'':'en')+' ausgewählt</span>'+
    (anzahl===1
      ? '<span class="wahl-hint">Hake mindestens eine weitere an, um sie zu einer Pauschal-Position zusammenzufassen.</span>'
      : '')+
    '<button type="button" class="wahl-btn" '+(anzahl<2?'disabled title="Mindestens zwei Positionen auswählen"':'')+
      ' onclick="zusammenfassen()">Zu einer Position zusammenfassen</button>'+
    '<button type="button" class="wahl-weg" onclick="wahlAufheben()">Auswahl aufheben</button>';
}
function zusammenfassen(){
  const ausgewaehlt = anzeigeListe().filter(p=>p._wahl);
  if(ausgewaehlt.length < 2) return;
  wahlUndoVorher = positionen.slice(); // alte Reihenfolge fürs Rückgängig sichern
  const erste = ausgewaehlt[0];
  // Beschreibungen als Zeilen untereinander — danach frei editierbar.
  const beschreibung = ausgewaehlt.map(p=>(p.beschreibung||'').trim()).filter(Boolean).join('\\n');
  // Pauschalpreis-Startwert: Summe der vorhandenen Zeilensummen; fehlt eine,
  // bleibt der Preis ehrlich offen (___ €) — nichts wird erfunden.
  let summe = 0, voll = true;
  for(const p of ausgewaehlt){
    const g = zeilensumme(p);
    if(g == null) voll = false; else summe += g;
  }
  const neue = { kategorie: erste.kategorie, beschreibung,
    menge: 1, einheit: 'pauschal',
    einzelpreis: voll ? Math.round(summe*100)/100 : null,
    preisquelle: voll ? 'MANUELL' : 'UNBEKANNT',
    vorschlag: false, mengeUnsicher: false };
  positionen.splice(positionen.indexOf(erste), 0, neue);
  for(const p of ausgewaehlt){
    const j = positionen.indexOf(p);
    if(j >= 0) positionen.splice(j, 1);
  }
  positionen.forEach(p=>{ delete p._wahl; });
  render(); markiereGeaendert();
  zeigeBewegung(neue, null);
  // Rückgängig-Angebot für ein paar Sekunden anzeigen.
  const leiste = document.getElementById('wahlLeiste');
  leiste.classList.add('an','undo');
  leiste.innerHTML =
    '<span>✓ '+ausgewaehlt.length+' Positionen zu einer Pauschale zusammengefasst.</span>'+
    '<button type="button" class="wahl-weg" onclick="zusammenfassenRueckgaengig()">Rückgängig</button>';
  clearTimeout(wahlUndoTimer);
  wahlUndoTimer = setTimeout(()=>{
    leiste.classList.remove('an','undo');
    wahlUndoVorher = null;
  }, 10000);
}
function zusammenfassenRueckgaengig(){
  if(!wahlUndoVorher) return;
  positionen = wahlUndoVorher;
  wahlUndoVorher = null;
  clearTimeout(wahlUndoTimer);
  const leiste = document.getElementById('wahlLeiste');
  leiste.classList.remove('an','undo');
  render(); markiereGeaendert();
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
  gedAktualisieren(i); // Einheit ist Teil des Gedächtnis-Schlüssels
  summen(); markiereGeaendert();
}

function summen(){
  const kats = kategorien();
  const mehrere = kats.length > 1;
  let html = '';
  // Gerade gelöschte Zeilen (Rückgängig-Frist) zählen nicht mehr mit.
  let nettoGesamt = 0, alleDa = positionen.some(p=>!p._geloescht);

  for(const kat of kats){
    const eigene = positionen.filter(p=>p.kategorie===kat && !p._geloescht);
    if(!eigene.length) continue;
    let netto = 0, voll = true;
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
    gedAktualisieren(i); // Merken-Knopf folgt dem Preis (da/weg/abweichend)
  }
  const g = zeilensumme(positionen[i]);
  const zelle = el.closest('tr').querySelector('.zeilensumme');
  if(zelle) zelle.innerHTML = g==null?OFFEN:euro(g);
  summen();
  markiereGeaendert();
}
// ── Positionen verschieben (Drag & Drop am ⠿-Anfasser, Desktop) ─
let dragP = null; // die gerade gezogene Position (Objekt-Referenz)
function dragMarkierungenWeg(){
  document.querySelectorAll('#postab tr').forEach(r=>r.classList.remove('drag-oben','drag-unten','drag-ziel'));
}
function dragVerdrahten(tr, p){
  const griff = tr.querySelector('.griff');
  // Ziehen startet NUR am Anfasser — sonst würde jede Textauswahl in den
  // Eingabefeldern versehentlich die ganze Zeile ziehen.
  griff.addEventListener('mousedown', ()=>{ tr.draggable = true; });
  griff.addEventListener('mouseup', ()=>{ tr.draggable = false; });
  tr.addEventListener('dragstart', e=>{
    dragP = p;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try{ e.dataTransfer.setData('text/plain',''); }catch(_){ }
  });
  tr.addEventListener('dragend', ()=>{ tr.draggable=false; tr.classList.remove('dragging'); dragMarkierungenWeg(); });
  tr.addEventListener('dragover', e=>{
    if(!dragP || dragP===p) return;
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    const r = tr.getBoundingClientRect();
    const oben = e.clientY < r.top + r.height/2;
    tr.classList.toggle('drag-oben', oben);
    tr.classList.toggle('drag-unten', !oben);
  });
  tr.addEventListener('dragleave', ()=>{ tr.classList.remove('drag-oben','drag-unten'); });
  tr.addEventListener('drop', e=>{
    e.preventDefault();
    if(!dragP || dragP===p) return;
    const r = tr.getBoundingClientRect();
    const oben = e.clientY < r.top + r.height/2;
    positionen.splice(positionen.indexOf(dragP), 1);
    dragP.kategorie = p.kategorie; // Ablage in anderer Kategorie wechselt sie
    positionen.splice(positionen.indexOf(p) + (oben?0:1), 0, dragP);
    const bewegt = dragP;
    dragP = null;
    render(); markiereGeaendert();
    zeigeBewegung(bewegt, null); // kurz aufblinken lassen
  });
}
// "+ Position hinzufügen"-Zeile als Ablageziel: ans Ende dieser Kategorie.
function dragZielKategorieEnde(trNeu, kat){
  trNeu.addEventListener('dragover', e=>{ if(!dragP) return; e.preventDefault(); e.dataTransfer.dropEffect='move'; trNeu.classList.add('drag-ziel'); });
  trNeu.addEventListener('dragleave', ()=>trNeu.classList.remove('drag-ziel'));
  trNeu.addEventListener('drop', e=>{
    e.preventDefault();
    if(!dragP) return;
    positionen.splice(positionen.indexOf(dragP), 1);
    dragP.kategorie = kat;
    let letzte = -1;
    positionen.forEach((q,qi)=>{ if(q.kategorie===kat && !q._geloescht) letzte=qi; });
    positionen.splice(letzte+1, 0, dragP);
    const bewegt = dragP;
    dragP = null;
    render(); markiereGeaendert();
    zeigeBewegung(bewegt, null);
  });
}

// ── Positionen mit ▲/▼ verschieben (Handy — dort gibt es kein Ziehen) ─
// Bewegt sich in der ANZEIGE-Reihenfolge (Material zuerst, dann Arbeit, dann
// eigene Kategorien); über eine Kategoriegrenze hinweg wechselt die Position
// die Kategorie — gleiches Verhalten wie Drag & Drop am PC.
function anzeigeListe(){
  const liste = [];
  for(const kat of kategorien()){
    positionen.forEach(p=>{ if(p.kategorie===kat && !p._geloescht) liste.push(p); });
  }
  return liste;
}
function verschiebePosition(i, richtung){
  const p = positionen[i];
  const liste = anzeigeListe();
  const nachbar = liste[liste.indexOf(p) + richtung];
  if(!nachbar) return; // schon ganz oben bzw. ganz unten
  // Alte Lage merken, damit die Zeile nach dem Neuaufbau sichtbar dorthin
  // GLEITET statt einfach umzuspringen (wichtig auf kleinen Bildschirmen).
  const altTr = document.querySelector('#postab tr[data-i="'+i+'"]');
  const altTop = altTr ? altTr.getBoundingClientRect().top : null;
  positionen.splice(positionen.indexOf(p), 1);
  const ni = positionen.indexOf(nachbar);
  if(nachbar.kategorie === p.kategorie){
    positionen.splice(richtung < 0 ? ni : ni+1, 0, p); // vor/hinter den Nachbarn
  } else {
    p.kategorie = nachbar.kategorie; // Grenze überschritten → Kategorie wechseln
    positionen.splice(richtung < 0 ? ni+1 : ni, 0, p);
  }
  render(); markiereGeaendert();
  zeigeBewegung(p, altTop);
}

// Verschobene Zeile nach dem Neuaufbau hervorheben: sie gleitet von der alten
// zur neuen Lage (FLIP-Trick: erst zurückversetzen, dann zu 0 animieren) und
// blinkt kurz auf. So sieht man auch auf dem Handy sofort, WAS passiert ist.
function zeigeBewegung(p, altTop){
  const tr = document.querySelector('#postab tr[data-i="'+positionen.indexOf(p)+'"]');
  if(!tr) return;
  if(altTop != null){
    const delta = altTop - tr.getBoundingClientRect().top;
    if(delta){
      tr.style.transition = 'none';
      tr.style.transform = 'translateY('+delta+'px)';
      requestAnimationFrame(()=>{
        tr.style.transition = 'transform .28s ease';
        tr.style.transform = '';
      });
      tr.addEventListener('transitionend', ()=>{ tr.style.transition=''; }, {once:true});
    }
  }
  tr.classList.add('bewegt');
  setTimeout(()=>tr.classList.remove('bewegt'), 800);
}

// Höhen-Übergang beim Löschen/Wiederherstellen: die Zeile schrumpft sichtbar
// auf die graue Rückgängig-Zeile zusammen (bzw. wächst wieder zur Karte auf),
// statt umzuspringen — gleiche Idee wie die Verschiebe-Animation (FLIP).
function zeigeGroessenwechsel(tr, altHoehe){
  if(!tr || altHoehe == null) return;
  const ziel = tr.getBoundingClientRect().height;
  if(Math.abs(altHoehe - ziel) < 6) return; // kaum Unterschied (Desktop-Tabelle)
  tr.style.transition = 'none';
  tr.style.height = altHoehe + 'px';
  tr.style.overflow = 'hidden';
  requestAnimationFrame(()=>{
    tr.style.transition = 'height .28s ease';
    tr.style.height = ziel + 'px';
  });
  const aufraeumen = ()=>{ tr.style.transition=''; tr.style.height=''; tr.style.overflow=''; };
  tr.addEventListener('transitionend', aufraeumen, {once:true});
  setTimeout(aufraeumen, 400); // Rückfallnetz, falls der Browser nichts animiert
}

// Löschen mit Reue-Frist: Die Zeile bleibt 8 Sekunden als graue
// Rückgängig-Zeile stehen (gespeichert wird sofort OHNE sie), danach — oder
// per Kreuzchen sofort — verschwindet sie endgültig aus der Ansicht.
function loeschen(i){
  const p = positionen[i];
  const altTr = document.querySelector('#postab tr[data-i="'+i+'"]');
  const altHoehe = altTr ? altTr.getBoundingClientRect().height : null;
  p._geloescht = true;
  clearTimeout(p._timer);
  p._timer = setTimeout(()=>{
    const idx = positionen.indexOf(p);
    if(idx >= 0 && positionen[idx]._geloescht){ positionen.splice(idx,1); render(); }
  }, 8000);
  render(); markiereGeaendert();
  zeigeGroessenwechsel(document.querySelector('#postab tr.geloescht-zeile[data-i="'+i+'"]'), altHoehe);
}
function wiederherstellen(i){
  const p = positionen[i];
  const altTr = document.querySelector('#postab tr.geloescht-zeile[data-i="'+i+'"]');
  const altHoehe = altTr ? altTr.getBoundingClientRect().height : null;
  clearTimeout(p._timer);
  delete p._geloescht; delete p._timer;
  render(); markiereGeaendert();
  zeigeGroessenwechsel(document.querySelector('#postab tr.pos-zeile[data-i="'+positionen.indexOf(p)+'"]'), altHoehe);
}
function endgueltigLoeschen(i){
  clearTimeout(positionen[i]._timer);
  positionen.splice(i,1);
  render(); // gespeichert wurde schon beim Löschen — nur die Ansicht auffrischen
}
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
// Speicher-Status an beiden Stellen anzeigen: in der Aktionszeile (Desktop)
// und in der Kopfzeile der zugeklappten Leiste (Handy). Null-sicher — bei
// Test-Konten gibt es die Aktionszeile mit #status nicht.
function statusSetzen(text,farbe){
  ['status','aktKopfStatus'].forEach(id=>{
    const s=document.getElementById(id);
    if(s){ s.textContent=text; s.style.color=farbe; }
  });
}
function markiereGeaendert(){
  statusSetzen('Nicht gespeichert','#b7791f');
  vorschauAktualisieren();
  clearTimeout(aenderungsTimer);
  aenderungsTimer=setTimeout(speichern,1200);
}

// ── A4-Live-Vorschau (nur Desktop, rechte Spalte) ─────────
// Baut das Vorschau-Dokument aus dem aktuellen Editor-Zustand — gleiche
// Reihenfolge, Nummerierung und Summenlogik wie PDF/Word (kategorien(),
// zeilensumme()). Offene Preise erscheinen ehrlich als ___ €.
function datumAusFeld(){
  const d = new Date(val('datum'));
  return isNaN(d.getTime()) ? new Date() : d;
}
function pvDatum(d){ return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function pvZeilen(){
  const kats = kategorien();
  const mehrere = kats.length > 1;
  let html=''; let nr=0; let nettoGesamt=0; let alleDa=positionen.some(p=>!p._geloescht);
  for(const kat of kats){
    const eigene = positionen.filter(p=>p.kategorie===kat && !p._geloescht);
    if(!eigene.length) continue;
    if(mehrere) html += '<tr class="kat"><td colspan="5">'+esc(katName(kat))+'</td></tr>';
    let netto=0, voll=true;
    for(const p of eigene){
      nr++;
      const g = zeilensumme(p);
      if(g==null) voll=false; else netto+=g;
      const menge = p.einheit==='pauschal' ? 'pauschal'
        : (p.menge==null ? '' : p.menge.toLocaleString('de-DE')+' '+einheitLabel(p.einheit||''));
      html += '<tr><td>'+nr+'</td><td>'+esc(p.beschreibung).replace(/\\n/g,'<br>')+'</td><td class="r">'+esc(menge)+'</td>'+
              '<td class="r">'+(p.einzelpreis==null?OFFEN:euro(p.einzelpreis))+'</td>'+
              '<td class="r">'+(g==null?OFFEN:euro(g))+'</td></tr>';
    }
    netto=Math.round(netto*100)/100; nettoGesamt+=netto; if(!voll) alleDa=false;
    if(mehrere) html += '<tr class="sum zw"><td colspan="4" class="r">Zwischensumme '+esc(katName(kat))+'</td><td class="r">'+(voll?euro(netto):OFFEN)+'</td></tr>';
  }
  nettoGesamt=Math.round(nettoGesamt*100)/100;
  const mwst=Math.round(nettoGesamt*START.mwstSatz)/100;
  html += '<tr class="sum erste"><td colspan="4" class="r">Nettosumme</td><td class="r">'+(alleDa?euro(nettoGesamt):OFFEN)+'</td></tr>';
  html += '<tr class="sum"><td colspan="4" class="r">zzgl. '+START.mwstSatz+' % MwSt.</td><td class="r">'+(alleDa?euro(mwst):OFFEN)+'</td></tr>';
  html += '<tr class="ges"><td colspan="4" class="r">Gesamtbetrag</td><td class="r">'+(alleDa?euro(Math.round((nettoGesamt+mwst)*100)/100):OFFEN)+'</td></tr>';
  return html;
}
function vorschauAktualisieren(){
  const tbody = document.getElementById('pvPositionen');
  if(!tbody) return;
  const kunde = [val('kundeName'), val('kundeStrasse'), val('kundePlzOrt')].map(s=>s.trim()).filter(Boolean);
  document.getElementById('pvKunde').innerHTML = kunde.map(esc).join('<br>');
  const dat = datumAusFeld();
  const knr = val('kundenNummer').trim();
  document.getElementById('pvMeta').innerHTML =
    esc(START.art==='ANGEBOT'?'Angebot':'Protokoll')+' Nr. '+esc(val('nummer'))+
    '<br>Datum: '+pvDatum(dat)+(knr ? '<br>Kundennr.: '+esc(knr) : '');
  const obj = val('objekt').trim();
  const objEl = document.getElementById('pvObjekt');
  objEl.textContent = obj; objEl.style.display = obj ? '' : 'none';
  document.getElementById('pvEinleitung').textContent = val('einleitung');
  tbody.innerHTML = pvZeilen();
  document.getElementById('pvSchluss').textContent = val('schlusstext');
  const g = document.getElementById('pvGueltig');
  if(g){
    const bis = new Date(dat.getTime() + KOND.tage*864e5);
    g.textContent = 'Dieses Angebot ist gültig bis '+pvDatum(bis)+'. Zahlungsziel: '+KOND.zahlungsziel+'.';
  }
}

async function speichern(){
  if(START.versendet) return; // schreibgeschützt: Server würde ohnehin 409 liefern
  const daten={
    kundeName:val('kundeName'), kundenNummer:val('kundenNummer'),
    kundeStrasse:val('kundeStrasse'), kundePlzOrt:val('kundePlzOrt'),
    nummer:val('nummer'), datum:val('datum'), objekt:val('objekt'),
    einleitung:val('einleitung'), schlusstext:val('schlusstext'),
    // Gerade gelöschte Zeilen (Rückgängig-Frist) und interne Felder bleiben
    // draußen — gespeichert wird der Zustand, wie er im Angebot landen soll.
    positionen: positionen.filter(p=>!p._geloescht).map(({_timer,_geloescht,_wahl,...rest})=>rest)
  };
  try{
    const r=await fetch('/api/a/'+START.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(daten)});
    if(!r.ok) throw 0;
    statusSetzen('✓ Gespeichert','#2e7d32');
  }catch(e){
    statusSetzen('Speichern fehlgeschlagen','#c0392b');
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

// Nur den Bearbeitungslink mailen (ohne Datei) — für "abends am PC weitermachen".
async function linkMailSenden(){
  if(!MAIL.email){
    mailStatus('Bitte zuerst deine E-Mail-Adresse eintragen und speichern.', '#c0392b');
    mailEingabeZeigen();
    return;
  }
  await speichern(); // aktueller Stand soll hinter dem Link stehen
  const btn=document.getElementById('mailLinkBtn');
  btn.disabled=true; const alt=btn.textContent; btn.textContent='Wird gesendet …';
  try{
    const r=await fetch('/api/a/'+START.token+'/mail-link',{method:'POST'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.fehler||'Versand fehlgeschlagen');
    mailStatus('📧 Bearbeitungslink gesendet an '+MAIL.email+'.', '#2e7d32');
  }catch(e){
    mailStatus('Link nicht gesendet: '+e.message, '#c0392b');
  }
  btn.disabled=false; btn.textContent=alt;
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

// ── Untere Leiste (Handy): zuklappbar + Auto-Aufklappen am Seitenende ──
const aktLeiste=document.querySelector('.aktionen');
const aktKopf=document.getElementById('aktKopf');
let aktManuellOffen=false;
function aktMobil(){ return window.matchMedia('(max-width:640px)').matches; }
if(aktLeiste && aktKopf){
  if(aktMobil()) aktLeiste.classList.add('zu');
  aktKopf.addEventListener('click', ()=>{
    const zu=aktLeiste.classList.toggle('zu');
    aktManuellOffen=!zu;
  });
  // Flacker-Schutz: Das Aufklappen macht die Seite höher, wodurch man
  // rechnerisch sofort nicht mehr "ganz unten" wäre — die Leiste würde
  // wieder zuklappen und alles flackert. Deshalb: nach dem Auto-Aufklappen
  // die Scroll-Lage merken und erst wieder zuklappen, wenn der Nutzer
  // DEUTLICH (150px) darüber hochgescrollt ist.
  let aktAutoAb = null;
  window.addEventListener('scroll', ()=>{
    if(!aktMobil()) return;
    const unten = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60;
    if(unten){
      if(aktLeiste.classList.contains('zu')){
        aktLeiste.classList.remove('zu');
        aktAutoAb = window.scrollY;
      }
    } else if(!aktManuellOffen && (aktAutoAb === null || window.scrollY < aktAutoAb - 150)){
      aktLeiste.classList.add('zu');
      aktAutoAb = null;
    }
  }, {passive:true});
}

mailInit();
render();
vorschauAktualisieren();
</script>
</body>
</html>`;
}
