// Erzeugt die HTML-Bearbeitungsseite für den Handwerker.
//
// Alles, was die KI erkannt hat, ist vorausgefüllt. Der Handwerker klickt
// hinein, ändert, ergänzt oder löscht Zeilen — die Summen rechnen im Browser
// live mit. Kein Word, keine Tabelle, kein Login. Gespeichert und exportiert
// wird über kleine API-Aufrufe (siehe routes.ts).
//
// Bewusst als eine selbsttragende Seite mit eingebettetem CSS und JS: kein
// Build-Schritt, kein Framework, laden auch auf einem alten Handy schnell.
import type { Dokument, Handwerker } from "@prisma/client";
import type { Preisliste } from "../preisliste.js";
import type { Position } from "../ai/structure.js";
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
  kundenUrl: string;
}): string {
  const { dokument, handwerker, preisliste, kundenUrl } = args;
  const b = preisliste.betrieb;
  const akzent = `#${/^[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe : "0B5CAD"}`;
  const logo = ladeLogo(b.logo);
  const positionen = JSON.parse(dokument.positionenJson) as Position[];
  const istAngebot = dokument.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Protokoll";

  // Anfangsdaten für das Skript — als JSON in die Seite eingebettet
  const startDaten = {
    token: dokument.bearbeitenToken,
    art: dokument.art,
    nummer: dokument.nummer,
    mwstSatz: dokument.mwstSatz,
    kundeName: dokument.kundeName ?? "",
    kundeAdresse: dokument.kundeAdresse ?? "",
    objekt: dokument.objekt ?? "",
    einleitung: dokument.einleitung,
    schlusstext: dokument.schlusstext,
    positionen,
    kundenUrl,
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
  .rahmen { max-width: 820px; margin: 0 auto; padding: 16px; }
  .karte { background:#fff; border-radius:12px; padding:22px; margin-bottom:16px;
           box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .kopf { display:flex; justify-content:space-between; align-items:center; gap:16px;
          border-bottom:3px solid var(--akzent); padding-bottom:14px; margin-bottom:18px; }
  .kopf .firma { font-size:20px; font-weight:700; color:var(--akzent); }
  .kopf .adr { font-size:12px; color:#666; margin-top:2px; }
  .kopf img { max-height:64px; max-width:180px; }
  h1 { font-size:19px; margin:0 0 4px; }
  .num { color:#666; font-size:14px; margin-bottom:18px; }
  label { display:block; font-size:13px; color:#555; margin:12px 0 4px; font-weight:600; }
  input, textarea, select { width:100%; padding:9px 11px; border:1px solid #cfd4da;
         border-radius:7px; font-size:15px; font-family:inherit; background:#fff; }
  textarea { min-height:80px; resize:vertical; }
  input:focus, textarea:focus, select:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
  .zwei { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { background:var(--akzent); color:#fff; font-size:12px; text-align:left; padding:8px; font-weight:600; }
  th.r, td.r { text-align:right; }
  td { padding:6px 6px; border-bottom:1px solid #eceff2; vertical-align:middle; }
  td input, td select { padding:6px 7px; font-size:14px; }
  .pos-menge { width:70px; } .pos-einheit { width:78px; } .pos-preis { width:92px; }
  .zeilensumme { font-weight:600; white-space:nowrap; font-size:14px; }
  .abschnitt td { background:#f2f5f8; font-weight:700; color:#555; font-size:13px; padding:9px 8px; }
  .loeschen { background:none; border:none; color:#c0392b; font-size:20px; cursor:pointer;
              padding:0 4px; line-height:1; }
  .loeschen:hover { color:#e74c3c; }
  .neu { background:#f2f5f8; border:1px dashed #b8c0c8; color:#444; border-radius:7px;
         padding:9px; width:100%; cursor:pointer; font-size:14px; margin-top:8px; }
  .neu:hover { background:#e9edf1; }
  .summen { margin-top:16px; margin-left:auto; width:min(340px,100%); font-size:15px; }
  .summen .z { display:flex; justify-content:space-between; padding:5px 0; }
  .summen .gesamt { border-top:2px solid var(--akzent); margin-top:6px; padding-top:10px;
                    font-size:19px; font-weight:700; color:var(--akzent); }
  .offen { color:#aab0b6; letter-spacing:1px; }
  .aktionen { position:sticky; bottom:0; background:#fff; border-radius:12px; padding:16px;
              box-shadow:0 -2px 10px rgba(0,0,0,.08); display:flex; gap:10px; flex-wrap:wrap;
              align-items:center; }
  .btn { border:none; border-radius:8px; padding:12px 18px; font-size:15px; font-weight:600;
         cursor:pointer; }
  .btn-p { background:var(--akzent); color:#fff; }
  .btn-s { background:#eef0f3; color:#333; }
  .btn:disabled { opacity:.5; cursor:default; }
  .status { font-size:13px; color:#2e7d32; margin-left:auto; }
  .hinweis { background:#eaf2fb; border-radius:8px; padding:12px 14px; font-size:14px; margin-bottom:14px; }
  .warn { background:#fff8e6; }
  @media (max-width:640px){ .zwei{grid-template-columns:1fr;} .pos-menge{width:56px;}
    .karte{padding:16px;} .kopf img{max-height:48px;} }
</style>
</head>
<body>
<div class="rahmen">

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

    <h1>${escapeHtml(titel)} bearbeiten</h1>
    <div class="num">${escapeHtml(dokument.nummer)}${dokument.version > 1 ? ` · Fassung ${dokument.version}` : ""}</div>

    <div class="zwei">
      <div><label>Kunde</label><input id="kundeName" value="${escapeHtml(startDaten.kundeName)}" placeholder="z. B. Familie Müller"></div>
      <div><label>Adresse</label><input id="kundeAdresse" value="${escapeHtml(startDaten.kundeAdresse)}" placeholder="Straße, Ort"></div>
    </div>
    <label>Objekt / Kurzbeschreibung</label>
    <input id="objekt" value="${escapeHtml(startDaten.objekt)}" placeholder="z. B. Wohnzimmer, ca. 45 m²">

    <label>Anschreiben (Einleitung)</label>
    <textarea id="einleitung">${escapeHtml(startDaten.einleitung)}</textarea>
  </div>

  <div class="karte">
    <label style="margin-top:0;">Positionen</label>
    <table>
      <thead><tr>
        <th>Leistung</th><th class="r">Menge</th><th>Einheit</th>
        <th class="r">Einzelpreis</th><th class="r">Gesamt</th><th></th>
      </tr></thead>
      <tbody id="zeilen"></tbody>
    </table>
    <button class="neu" onclick="neuePosition('LEISTUNG')">+ Leistung hinzufügen</button>
    <button class="neu" onclick="neuePosition('MATERIAL')">+ Material hinzufügen</button>

    <div class="summen">
      <div class="z"><span>Zwischensumme Arbeit</span><span id="sumArbeit">–</span></div>
      <div class="z"><span>Zwischensumme Material</span><span id="sumMaterial">–</span></div>
      <div class="z"><span>Nettosumme</span><span id="sumNetto">–</span></div>
      <div class="z"><span id="mwstLabel">zzgl. MwSt.</span><span id="sumMwst">–</span></div>
      <div class="z gesamt"><span>Gesamt</span><span id="sumBrutto">–</span></div>
    </div>
  </div>

  <div class="karte">
    <label style="margin-top:0;">Schlusstext</label>
    <textarea id="schlusstext">${escapeHtml(startDaten.schlusstext)}</textarea>
  </div>

  <div class="aktionen">
    <button class="btn btn-p" onclick="exportieren('pdf')">Als PDF</button>
    <button class="btn btn-s" onclick="exportieren('word')">Als Word</button>
    <button class="btn btn-s" onclick="kundenlinkZeigen()">Link für Kunden</button>
    <span class="status" id="status"></span>
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

function zeilensumme(p){
  const menge = p.einheit==='pauschal' ? (p.menge??1) : p.menge;
  if(menge==null || p.einzelpreis==null) return null;
  return Math.round(menge*p.einzelpreis*100)/100;
}

function render(){
  const tbody = document.getElementById('zeilen');
  tbody.innerHTML = '';
  const bloecke = [['LEISTUNG','Arbeitsaufwand'],['MATERIAL','Material']];
  let idx = 0;
  for(const [kat,label] of bloecke){
    const teil = positionen.filter(p=>p.kategorie===kat);
    if(teil.length===0) continue;
    if(bloecke.some(([k])=>positionen.some(p=>p.kategorie===k)) ){
      const tr = document.createElement('tr');
      tr.className='abschnitt';
      tr.innerHTML = '<td colspan="6">'+label+'</td>';
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
      idx++;
    });
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
  const teil = kat => positionen.filter(p=>p.kategorie===kat)
    .reduce((s,p)=>{const g=zeilensumme(p); return g==null?{...s,offen:true}:{netto:s.netto+g,offen:s.offen};},{netto:0,offen:false});
  const arbeit = teil('LEISTUNG'), material = teil('MATERIAL');
  const alleDa = positionen.length>0 && positionen.every(p=>zeilensumme(p)!=null);
  const netto = arbeit.netto+material.netto;
  const mwst = Math.round(netto*START.mwstSatz)/100;
  const setz=(id,v)=>document.getElementById(id).innerHTML=v;
  const hatMaterial = positionen.some(p=>p.kategorie==='MATERIAL');
  const hatArbeit = positionen.some(p=>p.kategorie==='LEISTUNG');
  setz('sumArbeit', hatArbeit ? (arbeit.offen?OFFEN:euro(arbeit.netto)) : '–');
  setz('sumMaterial', hatMaterial ? (material.offen?OFFEN:euro(material.netto)) : '–');
  setz('sumNetto', alleDa?euro(netto):OFFEN);
  setz('sumMwst', alleDa?euro(mwst):OFFEN);
  setz('sumBrutto', alleDa?euro(netto+mwst):OFFEN);
  document.getElementById('mwstLabel').textContent = 'zzgl. '+START.mwstSatz+' % MwSt.';
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
  positionen.push({kategorie:kat,beschreibung:'',menge:null,einheit:'m2',einzelpreis:null});
  render(); markiereGeaendert();
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

let aenderungsTimer=null;
['kundeName','kundeAdresse','objekt','einleitung','schlusstext'].forEach(id=>{
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
    kundeName:val('kundeName'), kundeAdresse:val('kundeAdresse'), objekt:val('objekt'),
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
  document.getElementById('status').textContent='Erzeuge '+(format==='pdf'?'PDF':'Word')+' …';
  window.location.href='/api/a/'+START.token+'/export.'+format;
}

function kundenlinkZeigen(){
  const url=START.kundenUrl;
  navigator.clipboard?.writeText(url).then(
    ()=>alert('Link für den Kunden kopiert:\\n\\n'+url+'\\n\\nDer Kunde sieht das Angebot und kann es mit einem Klick annehmen.'),
    ()=>prompt('Link für den Kunden:',url)
  );
}

render();
</script>
</body>
</html>`;
}
