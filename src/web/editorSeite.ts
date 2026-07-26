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
import type { EingabePosition } from "../angebot/berechnung.js";
import { ladeLogo } from "../betrieb/logo.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EINHEITEN = ["m2", "lfm", "Stk", "Std", "pauschal"] as const;

export function editorSeite(args: {
  dokument: Dokument;
  handwerker: Handwerker;
  preisliste: Preisliste;
  /** Link zurück zu den Betriebseinstellungen inkl. Angebotsübersicht. */
  einstellungenUrl?: string;
}): string {
  const { dokument, preisliste, einstellungenUrl } = args;
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
  label { display:block; font-size:13px; color:#555; margin:12px 0 4px; font-weight:600; }
  input, textarea, select { width:100%; padding:9px 11px; border:1px solid #cfd4da;
         border-radius:7px; font-size:15px; font-family:inherit; background:#fff; }
  textarea { min-height:80px; resize:vertical; }
  input:focus, textarea:focus, select:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
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
  tr.abschnitt td { background:#f2f5f8; font-weight:700; color:#555; font-size:13px; padding:9px 8px; }
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
  .aktionen { position:sticky; bottom:0; background:#fff; border-radius:12px; padding:14px 16px;
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
  }
</style>
</head>
<body>
<div class="rahmen">

  ${
    einstellungenUrl
      ? `<a class="zurueck" href="${escapeHtml(einstellungenUrl)}">← Zurück zu Einstellungen &amp; allen Angeboten</a>`
      : ""
  }

  ${
    startDaten.angenommen
      ? `<div class="hinweis warn">🔒 Dieses Angebot wurde vom Kunden bereits angenommen und ist eingefroren.
         Änderungen erzeugen eine neue Fassung.</div>`
      : ""
  }

  <div class="karte">
    <div class="kopf">
      <div>
        <div class="firma">${escapeHtml(b.firma)}</div>
        <div class="adr">${escapeHtml([b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon].filter(Boolean).join(" · "))}</div>
      </div>
      ${logo ? `<img src="${logo.dataUrl}" alt="Logo">` : ""}
    </div>

    <div class="zwei">
      <div><label>Kunde</label><input id="kundeName" value="${escapeHtml(startDaten.kundeName)}" placeholder="z. B. Familie Müller"></div>
      <div><label>Kundennummer</label><input id="kundenNummer" value="${escapeHtml(startDaten.kundenNummer)}" placeholder="optional"></div>
    </div>
    <div class="zwei">
      <div><label>Straße und Hausnummer</label><input id="kundeStrasse" value="${escapeHtml(startDaten.kundeStrasse)}" placeholder="z. B. Rotberg 18"></div>
      <div><label>PLZ und Ort</label><input id="kundePlzOrt" value="${escapeHtml(startDaten.kundePlzOrt)}" placeholder="z. B. 12345 Musterstadt"></div>
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
    <table>
      <thead><tr>
        <th>Leistung</th><th class="r">Menge</th><th>Einheit</th>
        <th class="r">Einzelpreis</th><th class="r">Gesamt</th><th></th>
      </tr></thead>
      <tbody id="zeilen"></tbody>
    </table>
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

  <div class="aktionen">
    <div class="zeile1">
      <span class="dl-label">Herunterladen als:</span>
      <button class="btn" onclick="exportieren('pdf')">PDF</button>
      <button class="btn" onclick="exportieren('word')">Word</button>
      <span class="status" id="status"></span>
    </div>
  </div>

</div>

<script>
const START = ${JSON.stringify(startDaten)};
const EINHEITEN = ${JSON.stringify(EINHEITEN)};
let positionen = START.positionen.map(p => ({
  kategorie: p.kategorie, beschreibung: p.beschreibung,
  menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis
}));

const euro = n => n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const OFFEN = '<span class="offen">___ €</span>';
const katName = k => k==='LEISTUNG' ? 'Arbeitsaufwand' : (k==='MATERIAL' ? 'Material' : k);

function zeilensumme(p){
  const menge = p.einheit==='pauschal' ? (p.menge??1) : p.menge;
  if(menge==null || p.einzelpreis==null) return null;
  return Math.round(menge*p.einzelpreis*100)/100;
}

/** Kategorien in der Reihenfolge ihres ersten Auftretens. */
function kategorien(){
  const reihe = [];
  for(const p of positionen){ if(!reihe.includes(p.kategorie)) reihe.push(p.kategorie); }
  return reihe;
}

function render(){
  const tbody = document.getElementById('zeilen');
  tbody.innerHTML = '';
  const kats = kategorien();
  const mehrere = kats.length > 1;

  for(const kat of kats){
    if(mehrere){
      const tr = document.createElement('tr');
      tr.className='abschnitt';
      tr.innerHTML = '<td colspan="6">'+esc(katName(kat))+'</td>';
      tbody.appendChild(tr);
    }
    positionen.forEach((p,i)=>{
      if(p.kategorie!==kat) return;
      const g = zeilensumme(p);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input value="'+esc(p.beschreibung)+'" oninput="setF('+i+',\\'beschreibung\\',this.value)"></td>'+
        '<td class="r"><input class="pos-menge r" inputmode="decimal" value="'+(p.menge??'')+'" oninput="setNum('+i+',\\'menge\\',this.value,this)"></td>'+
        '<td>'+einheitSelect(i,p.einheit)+'</td>'+
        '<td class="r"><input class="pos-preis r" inputmode="decimal" value="'+(p.einzelpreis??'')+'" placeholder="___" oninput="setNum('+i+',\\'einzelpreis\\',this.value,this)"></td>'+
        '<td class="r zeilensumme">'+(g==null?OFFEN:euro(g))+'</td>'+
        '<td><button class="loeschen" title="Zeile löschen" onclick="loeschen('+i+')">×</button></td>';
      tbody.appendChild(tr);
    });
    // "+ Position hinzufügen" direkt unter dem jeweiligen Abschnitt
    const trNeu = document.createElement('tr');
    trNeu.className='hinzu';
    trNeu.innerHTML = '<td colspan="6"><button class="neu" onclick="neuePosition(\\''+escJs(kat)+'\\')">+ Position'+(mehrere?' unter „'+esc(katName(kat))+'“':'')+' hinzufügen</button></td>';
    tbody.appendChild(trNeu);
  }
  summen();
}

function einheitSelect(i,wert){
  let s = '<select class="pos-einheit" onchange="setF('+i+',\\'einheit\\',this.value)">';
  for(const e of EINHEITEN){
    s += '<option value="'+e+'"'+(e===wert?' selected':'')+'>'+e+'</option>';
  }
  return s+'</select>';
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
  const neue = {kategorie:kat,beschreibung:'',menge:null,einheit:'m2',einzelpreis:null};
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
  positionen.push({kategorie:name,beschreibung:'',menge:null,einheit:'m2',einzelpreis:null});
  feld.value='';
  render(); markiereGeaendert();
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function escJs(s){ return (s||'').replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'"); }

let aenderungsTimer=null;
['kundeName','kundenNummer','kundeStrasse','kundePlzOrt','nummer','datum','objekt','einleitung','schlusstext'].forEach(id=>{
  document.getElementById(id).addEventListener('input',markiereGeaendert);
});
function markiereGeaendert(){
  document.getElementById('status').textContent='Nicht gespeichert';
  document.getElementById('status').style.color='#b7791f';
  clearTimeout(aenderungsTimer);
  aenderungsTimer=setTimeout(speichern,1200);
}

async function speichern(){
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
  window.location.href='/api/a/'+START.token+'/export.'+format;
}

render();
</script>
</body>
</html>`;
}
