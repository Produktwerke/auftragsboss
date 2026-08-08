// Die persönliche Einstellungsseite eines Betriebs.
//
// Erreichbar über den passwortlosen Link /einstellungen/<token>. Hier pflegt
// der Handwerker Logo, Betriebsdaten, Akzentfarbe und Standardtexte — und sieht
// rechts eine große, sticky Live-Vorschau seines Angebots (als echtes
// A4-Dokument). Alles speichert automatisch, wie im Editor.
//
// Die Akzentfarbe (Kundenfarbe) erscheint AUSSCHLIESSLICH in der Vorschau bzw.
// im generierten Angebot — nie im Dashboard-Chrome. Nutzt die gemeinsame
// App-Shell (feste Sidebar + Topbar). Selbsttragend, kein Framework.
import type { Handwerker } from "@prisma/client";
import type { Preisliste } from "../preisliste.js";
import { appShell } from "./navigation.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

export function einstellungenSeite(args: {
  handwerker: Handwerker;
  vorgabe: Preisliste;
  logoDataUrl: string | null;
  akzent: string;
  dokumente: DokUebersicht[];
  token: string;
}): string {
  const { handwerker: h, vorgabe, logoDataUrl, akzent, token } = args;
  const v = vorgabe.betrieb;

  const feld = (wert: string | null, platzhalter: string) => ({ wert: wert ?? "", ph: platzhalter });
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
  const hint = (text: string) => `<span class="hint">${escapeHtml(text)}</span>`;

  const content = `
      <div class="page-head">
        <div>
          <h1 class="greet">Einstellungen</h1>
          <p class="sub">Diese Angaben erscheinen auf jedem Angebot. Einmal einstellen — danach passt alles automatisch.</p>
        </div>
        <div class="save-hint">Automatisch gespeichert <span class="statusmsg" id="status"></span></div>
      </div>

      <div class="settings-layout">
        <div class="settings-forms">

          <div class="section">
            <div class="section-h"><h2>Logo &amp; Erscheinungsbild</h2><p>PNG oder JPG mit möglichst transparentem Hintergrund, max. 3 MB. Die Akzentfarbe erscheint nur auf deinen Angeboten — nicht im Cockpit.</p></div>
            <div class="section-b">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <label class="btn prim" for="logoDatei" style="cursor:pointer;">Logo hochladen<input type="file" id="logoDatei" accept="image/png,image/jpeg" hidden></label>
                <button class="btn ghost" id="logoEntfernen" style="color:#c0392b;${logoDataUrl ? "" : "display:none;"}">Entfernen</button>
                <span class="statusmsg" id="logoStatus"></span>
              </div>
              <div class="field" style="margin-top:16px;">
                <label>Akzentfarbe <span style="font-weight:400;color:var(--faint);">(nur im Angebot)</span></label>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <input type="color" id="farbe" value="${akzent}" style="width:48px;height:40px;padding:2px;border:1px solid var(--line-2);border-radius:8px;cursor:pointer;">
                  <input type="text" id="farbeHex" value="${escapeHtml(akzent.toUpperCase())}" maxlength="7" spellcheck="false" style="width:130px;font-family:var(--mono);text-transform:uppercase;">
                  <span class="hint" style="margin:0;">Für Briefkopf und Summen im Angebot.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-h"><h2>Firmendaten</h2><p>Was hier steht, erscheint im Briefkopf oder in der Fußzeile deiner Angebote.</p></div>
            <div class="section-b">
              <div class="grid2">
                <div class="field"><label>Firma</label>${inp("firma", f.firma)}${hint("Briefkopf (groß) und Fußzeile")}</div>
                <div class="field"><label>Inhaber / Ansprechpartner</label>${inp("name", f.name)}${hint("Fußzeile („Ansprechpartner: …“)")}</div>
              </div>
              <div class="field"><label>Straße und Hausnummer</label>${inp("strasse", f.strasse)}${hint("Briefkopf-Adresszeile und Fußzeile")}</div>
              <div class="field">
                <label>PLZ und Ort</label>
                <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;">
                  ${inp("plz", f.plz, 'aria-label="PLZ"')}
                  ${inp("ort", f.ort, 'aria-label="Ort"')}
                </div>
                ${hint("Briefkopf-Adresszeile und Fußzeile")}
              </div>
              <div class="grid2">
                <div class="field"><label>Telefon</label>${inp("telefon", f.telefon)}${hint("Briefkopf-Adresszeile")}</div>
                <div class="field"><label>E-Mail</label>${inp("email", f.email, 'type="email"')}${hint("Briefkopf; auch Absender-/Zieladresse beim Mailversand")}</div>
              </div>
              <div class="grid2">
                <div class="field"><label>USt-IdNr. <span style="font-weight:400;color:var(--faint);">(optional)</span></label>${inp("ustIdNr", f.ustIdNr)}${hint("Fußzeile des Angebots")}</div>
                <div class="field"><label>Bankverbindung <span style="font-weight:400;color:var(--faint);">(optional)</span></label>${inp("bank", f.bank)}${hint("Fußzeile des Angebots")}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-h"><h2>Angebots-Texte</h2><p>Feste Textbausteine für jedes Angebot — im Angebot jederzeit überschreibbar.</p></div>
            <div class="section-b">
              <div class="field"><label>Standard-Anschreiben <span style="font-weight:400;color:var(--faint);">(optional)</span></label>
                <textarea id="standardEinleitung" placeholder="z.B. Sehr geehrte Damen und Herren, vielen Dank für Ihr Interesse …">${escapeHtml(f.standardEinleitung.wert)}</textarea>
              </div>
              <div class="field"><label>Schlusstext / Haftungshinweis</label>
                <textarea id="standardSchlusstext" placeholder="z.B. Es gelten unsere allgemeinen Geschäftsbedingungen. Gewährleistung nach den gesetzlichen Bestimmungen.">${escapeHtml(f.standardSchlusstext.wert)}</textarea>
                ${hint("Wird an jedes Angebot angehängt.")}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-h"><h2>Preise &amp; Ablauf</h2><p>AuftragsBoss erfindet nie Preise. Diese Schalter steuern, wie es dich unterstützt.</p></div>
            <div class="section-b">
              <label class="check" style="margin-bottom:14px;">
                <input type="checkbox" id="preisGedaechtnisAktiv" ${h.preisGedaechtnisAktiv ? "checked" : ""}>
                <span><b>Meine Preise merken (Preisgedächtnis).</b><br><span class="hint" style="margin:0;">Merkt sich datiert, wie du ähnliche Leistungen zuletzt kalkuliert hast, und schlägt den Preis beim nächsten Mal vor. Du bestätigst jeden Vorschlag selbst.</span></span>
              </label>
              <label class="check">
                <input type="checkbox" id="zusammenfassungAktiv" ${h.zusammenfassungAktiv ? "checked" : ""}>
                <span><b>Vor dem Angebot kurz zusammenfassen, was verstanden wurde.</b><br><span class="hint" style="margin:0;">Du bestätigst per „ja" oder korrigierst per Sprache. Abschaltbar auch per Nachricht „ohne Zusammenfassung".</span></span>
              </label>
            </div>
          </div>

          <div class="section">
            <div class="section-h"><h2>Feedback ans AuftragsBoss-Team</h2><p>Was fehlt, was nervt, was gefällt? Wir lesen jede Rückmeldung.</p></div>
            <div class="section-b">
              <div class="field"><textarea id="feedbackText" placeholder="Deine Nachricht an uns …"></textarea></div>
              <div style="display:flex;align-items:center;gap:12px;">
                <button class="btn prim" id="feedbackSenden">Absenden</button>
                <span class="statusmsg" id="feedbackStatus"></span>
              </div>
            </div>
          </div>

        </div><!-- /settings-forms -->

        <aside class="settings-preview">
          <div class="preview-head">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            Live-Vorschau
          </div>
          <div class="doc">
            <div class="d-head">
              <div>
                <div class="d-firma" id="pvFirma">${escapeHtml(f.firma.wert || f.firma.ph)}</div>
                <div class="d-adr" id="pvAdr"></div>
              </div>
              <div class="d-logo" id="pvLogoBox">
                ${logoDataUrl ? `<img id="pvLogo" src="${logoDataUrl}" alt="Logo">` : `<div class="kein-logo" id="pvLogoLeer">noch kein Logo</div>`}
              </div>
            </div>
            <div class="d-meta">
              <div>Familie Mustermann<br>Musterstraße 12<br>70000 Musterstadt</div>
              <div class="d-nr">Angebot Nr. 2026-0001<br>Datum: ${datumDE(new Date())}</div>
            </div>
            <div class="d-titel">Angebot</div>
            <div class="d-text" id="pvEinleitung"></div>
            <table>
              <thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Gesamt</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>Wände und Decken streichen</td><td class="r">pauschal</td><td class="r">850,00 €</td><td class="r">850,00 €</td></tr>
                <tr><td>2</td><td>Alte Tapete entfernen</td><td class="r">pauschal</td><td class="r">220,00 €</td><td class="r">220,00 €</td></tr>
                <tr><td>3</td><td>Dispersionsfarbe (Material)</td><td class="r">4 Rolle</td><td class="r">45,00 €</td><td class="r">180,00 €</td></tr>
                <tr class="sum erste"><td colspan="4" class="r">Nettosumme</td><td class="r">1.250,00 €</td></tr>
                <tr class="sum"><td colspan="4" class="r">zzgl. 19 % MwSt.</td><td class="r">237,50 €</td></tr>
                <tr class="ges"><td colspan="4" class="r">Gesamtbetrag</td><td class="r">1.487,50 €</td></tr>
              </tbody>
            </table>
            <div class="d-text" id="pvSchluss"></div>
            <div class="d-gueltig">Gültig bis ${datumDE(new Date(Date.now() + 30 * 864e5))}. Zahlungsziel: ${escapeHtml(vorgabe.konditionen?.zahlungsziel ?? "14 Tage")}.</div>
            <div class="d-fuss" id="pvFuss"></div>
          </div>
          <p class="preview-note">So sieht ein Angebot mit deinen Angaben aus. Ändert sich sofort, während du links tippst. Positionen und Preise sind Beispiele.</p>
        </aside>
      </div>`;

  const headExtra = `:root{ --akzent:${akzent}; }
  .save-hint{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:8px;}
  .settings-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:24px;align-items:start;}
  .settings-preview{position:sticky;top:80px;}
  .preview-head{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px;}
  .preview-note{font-size:12px;color:var(--faint);margin:12px 2px 0;line-height:1.5;}
  /* A4-Dokument (nur hier die Kundenfarbe) */
  .doc{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 34px rgba(16,24,40,.12);padding:26px 26px 20px;color:#222;}
  .doc .d-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid var(--akzent);padding-bottom:13px;}
  .doc .d-firma{font-size:19px;font-weight:800;color:var(--akzent);line-height:1.15;}
  .doc .d-adr{font-size:11.5px;color:#666;margin-top:5px;line-height:1.5;}
  .doc .d-logo img{max-height:52px;max-width:150px;object-fit:contain;}
  .doc .d-logo .kein-logo{font-size:11px;color:#bbb;border:1px dashed #d5dade;border-radius:6px;padding:12px 14px;text-align:center;}
  .doc .d-meta{display:flex;justify-content:space-between;gap:16px;margin-top:15px;font-size:11.5px;color:#444;line-height:1.5;}
  .doc .d-nr{text-align:right;color:#555;white-space:nowrap;}
  .doc .d-titel{font-size:16px;font-weight:800;margin:15px 0 4px;color:#222;}
  .doc .d-text{font-size:11.5px;color:#333;white-space:pre-wrap;margin:7px 0;line-height:1.55;}
  .doc table{width:100%;border-collapse:collapse;margin:9px 0;}
  .doc th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#8a9099;border-bottom:1px solid #d7dae0;padding:0 6px 5px 0;font-weight:700;}
  .doc th.r,.doc td.r{text-align:right;padding-right:0;white-space:nowrap;}
  .doc td{padding:6px 6px 6px 0;border-bottom:1px solid #eef1f3;font-size:11.5px;color:#333;}
  .doc tr.sum td{border:none;padding:3px 6px 3px 0;color:#444;}
  .doc tr.sum.erste td{padding-top:9px;}
  .doc tr.ges td{font-weight:800;color:var(--akzent);border-top:2px solid var(--akzent);border-bottom:none;padding-top:7px;}
  .doc .d-gueltig{font-size:10.5px;color:#666;margin-top:11px;}
  .doc .d-fuss{font-size:9.5px;color:#8a8a8a;margin-top:15px;padding-top:9px;border-top:1px solid #eceff2;line-height:1.6;}
  @media (max-width:960px){ .settings-layout{grid-template-columns:1fr;} .settings-preview{position:static;order:-1;margin-bottom:6px;} }`;

  const scriptExtra = `
const TOKEN = ${JSON.stringify(token)};
const FELDER = ["firma","name","strasse","plz","ort","telefon","email","ustIdNr","bank","standardEinleitung","standardSchlusstext"];
const val = id => document.getElementById(id).value;

function aktualisiereVorschau(){
  const ph = id => document.getElementById(id).placeholder;
  const wert = id => val(id).trim() || ph(id);
  const firma = wert("firma");
  document.getElementById("pvFirma").textContent = firma;
  const kopf = [wert("strasse"), [wert("plz"), wert("ort")].filter(Boolean).join(" "), wert("telefon"), wert("email")].filter(Boolean);
  document.getElementById("pvAdr").textContent = kopf.join("  ·  ");
  document.getElementById("pvEinleitung").textContent =
    val("standardEinleitung").trim() || "Sehr geehrte Familie Mustermann,\\nvielen Dank für Ihre Anfrage. Gerne biete ich Ihnen folgende Leistungen an:";
  document.getElementById("pvSchluss").textContent =
    val("standardSchlusstext").trim() || ("Mit freundlichen Grüßen\\n" + firma);
  const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const z1 = [[firma, wert("strasse"), [wert("plz"), wert("ort")].filter(Boolean).join(" ")].filter(Boolean).join(", ")];
  const name = wert("name"); if(name) z1.push("Ansprechpartner: " + name);
  const z2 = [];
  const ust = wert("ustIdNr"); if(ust) z2.push("USt-IdNr.: " + ust);
  const bank = wert("bank"); if(bank) z2.push("Bank: " + bank);
  const zeilen = [z1.join("   ·   ")];
  if(z2.length) zeilen.push(z2.join("   ·   "));
  document.getElementById("pvFuss").innerHTML = zeilen.map(esc).join("<br>");
  // Akzentfarbe live in die Vorschau (nur dort referenziert)
  document.documentElement.style.setProperty("--akzent", document.getElementById("farbe").value);
}

let timer=null;
function markiere(){
  setStatus("status","· nicht gespeichert","var(--warn)");
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
    setStatus("status","✓ gespeichert","var(--ok)");
  }catch(e){ setStatus("status","Speichern fehlgeschlagen","#c0392b"); }
}
function setStatus(id,text,farbe){ const s=document.getElementById(id); s.textContent=text; s.style.color=farbe; }

FELDER.forEach(id=>document.getElementById(id).addEventListener("input",markiere));
const farbeInput=document.getElementById("farbe");
const farbeHexInput=document.getElementById("farbeHex");
farbeInput.addEventListener("input",()=>{ farbeHexInput.value=farbeInput.value.toUpperCase(); markiere(); });
farbeHexInput.addEventListener("input",()=>{
  let v=farbeHexInput.value.trim(); if(v && v[0]!=="#") v="#"+v;
  if(/^#[0-9a-fA-F]{6}$/.test(v)){ farbeInput.value=v; markiere(); }
});
farbeHexInput.addEventListener("blur",()=>{ farbeHexInput.value=farbeInput.value.toUpperCase(); });
document.getElementById("preisGedaechtnisAktiv").addEventListener("change",markiere);
document.getElementById("zusammenfassungAktiv").addEventListener("change",markiere);

document.getElementById("logoDatei").addEventListener("change",function(){
  const datei=this.files&&this.files[0];
  if(!datei) return;
  if(datei.size>3*1024*1024){ setStatus("logoStatus","Bild zu groß (max. 3 MB)","#c0392b"); return; }
  setStatus("logoStatus","Wird hochgeladen …","var(--muted)");
  const leser=new FileReader();
  leser.onload=async()=>{
    try{
      const r=await fetch("/api/einstellungen/"+TOKEN+"/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataUrl:leser.result})});
      const antwort=await r.json();
      if(!r.ok) throw new Error(antwort.fehler||"Fehler");
      zeigeLogo(antwort.logoDataUrl);
      setStatus("logoStatus","✓ Logo gespeichert","var(--ok)");
    }catch(e){ setStatus("logoStatus",e.message||"Upload fehlgeschlagen","#c0392b"); }
  };
  leser.readAsDataURL(datei);
  this.value="";
});
document.getElementById("logoEntfernen").addEventListener("click",async()=>{
  if(!confirm("Logo wirklich entfernen?")) return;
  try{
    const r=await fetch("/api/einstellungen/"+TOKEN+"/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entfernen:true})});
    if(!r.ok) throw 0;
    zeigeLogo(null);
    setStatus("logoStatus","Logo entfernt","var(--muted)");
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

document.getElementById("feedbackSenden").addEventListener("click", async () => {
  const t = document.getElementById("feedbackText").value.trim();
  if (t.length < 3) { setStatus("feedbackStatus","Bitte kurz etwas schreiben","var(--warn)"); return; }
  setStatus("feedbackStatus","Wird gesendet …","var(--muted)");
  try {
    const r = await fetch("/api/einstellungen/"+TOKEN+"/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})});
    if(!r.ok) throw 0;
    document.getElementById("feedbackText").value="";
    setStatus("feedbackStatus","✓ Danke für dein Feedback!","var(--ok)");
  } catch(e){ setStatus("feedbackStatus","Senden fehlgeschlagen","#c0392b"); }
});

aktualisiereVorschau();
`;

  return appShell({
    token,
    aktiv: "einstellungen",
    handwerker: h,
    logoDataUrl,
    titel: "Einstellungen",
    content,
    headExtra,
    scriptExtra,
  });
}
