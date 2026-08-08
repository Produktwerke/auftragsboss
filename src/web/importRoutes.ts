// Web-Routen für den Altangebots-Import (Maler-Fachengine v1).
//
//   GET  /import/:token        → schlichte Upload-Seite (passwortloser Token)
//   POST /api/import/:token    → Datei hochladen, extrahieren, ablegen
//
// Alles hinter FEATURE_IMPORT: ist das Flag aus, existieren die Routen nicht
// (404) — das Live-Verhalten bleibt unberührt, bis der Baustein bewusst
// scharfgeschaltet wird. Betrieb wird über den einstellungenToken erkannt
// (derselbe passwortlose Ansatz wie bei Editor/Einstellungen); die Ablage ist
// streng tenant-gebunden (siehe importDienst/erzwingeTenant).
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { prisma } from "../pipeline.js";
import { featureConfig } from "../config.js";
import { importiereAltangebot } from "../maler/import/importDienst.js";
import { ImportFormatFehler } from "../maler/import/extraktion.js";
import { merkePreiseAusImport } from "../betrieb/preisgedaechtnis.js";
import { appShell } from "./navigation.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — großzügig für gescannte Angebote
const MAX_DATEIEN = 20; // pro Upload

export async function importRoutes(app: FastifyInstance): Promise<void> {
  // Baustein komplett aus: keine Routen registrieren.
  if (!featureConfig().FEATURE_IMPORT) return;

  await app.register(multipart, {
    // Mehrere Dateien je Upload. throwFileSizeLimit=false: eine zu große Datei
    // bricht nicht den ganzen Stapel ab, sie wird als abgeschnitten markiert.
    limits: { files: MAX_DATEIEN, fileSize: MAX_BYTES },
    throwFileSizeLimit: false,
  });

  // ── Upload-Seite ──────────────────────────────────────
  app.get<{ Params: { token: string } }>("/import/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
      select: { id: true, firma: true, name: true, preisGedaechtnisAktiv: true },
    });
    if (!handwerker) return reply.code(404).type("text/html").send("<h1>Nicht gefunden</h1>");
    return reply
      .type("text/html; charset=utf-8")
      .send(
        importSeite(
          req.params.token,
          { firma: handwerker.firma, name: handwerker.name },
          handwerker.preisGedaechtnisAktiv,
        ),
      );
  });

  // ── Upload verarbeiten (mehrere Dateien je Stapel) ────
  app.post<{ Params: { token: string } }>("/api/import/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
      select: { id: true },
    });
    if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

    // Jede Datei einzeln verarbeiten; ein Fehler bei einer Datei stoppt die
    // übrigen nicht (er wird pro Datei zurückgemeldet).
    const ergebnisse: Array<Record<string, unknown>> = [];
    for await (const teil of req.files()) {
      const dateiname = teil.filename;
      try {
        const buffer = await teil.toBuffer();
        if (teil.file.truncated) {
          ergebnisse.push({ dateiname, fehler: `Datei zu groß (max. ${MAX_BYTES / 1024 / 1024} MB).` });
          continue;
        }
        const ergebnis = await importiereAltangebot(prisma, handwerker.id, buffer, dateiname, teil.mimetype);
        ergebnisse.push({ dateiname, ...ergebnis });
      } catch (err) {
        if (err instanceof ImportFormatFehler) {
          ergebnisse.push({ dateiname, fehler: err.message });
          continue;
        }
        req.log.error(err, "Altangebot-Import fehlgeschlagen");
        ergebnisse.push({ dateiname, fehler: "Import fehlgeschlagen." });
      }
    }

    if (ergebnisse.length === 0) return reply.code(400).send({ fehler: "Keine Datei hochgeladen." });
    return reply.send({ ok: true, ergebnisse });
  });

  // ── Import bestätigen ("kontrolliertes Lernen") ───────
  // Erst hier wandern die Preise ins Preisgedächtnis — und nur, wenn der Betrieb
  // das Preisgedächtnis eingeschaltet hat. Ohne Bestätigung wird nichts gelernt.
  app.post<{ Params: { token: string; importId: string } }>(
    "/api/import/:token/bestaetigen/:importId",
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
        select: { id: true, preisGedaechtnisAktiv: true },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      // Tenant-sicher: nur ein Dokument dieses Betriebs auf BESTAETIGT setzen.
      const treffer = await prisma.importDokument.updateMany({
        where: { id: req.params.importId, handwerkerId: handwerker.id },
        data: { status: "BESTAETIGT" },
      });
      if (treffer.count === 0) return reply.code(404).send({ fehler: "Import nicht gefunden" });

      if (!handwerker.preisGedaechtnisAktiv) {
        return reply.send({
          ok: true,
          uebernommen: 0,
          preisgedaechtnisAus: true,
          hinweis: "Import bestätigt. Das Preisgedächtnis ist ausgeschaltet — es wurden keine Preise gemerkt.",
        });
      }

      const uebernommen = await merkePreiseAusImport(prisma, handwerker.id, req.params.importId);
      return reply.send({ ok: true, uebernommen });
    },
  );
}

/** Upload-Seite für Altangebote — im modernen App-Shell-Layout. */
function importSeite(
  token: string,
  handwerker: { firma: string | null; name: string | null },
  preisGedaechtnisAktiv: boolean,
): string {
  const gedaechtnisHinweis = preisGedaechtnisAktiv
    ? "Nach dem Bestätigen merkt sich AuftragsBoss deine Preise (datiert) und schlägt sie beim nächsten Angebot vor."
    : "Dein Preisgedächtnis ist ausgeschaltet — Preise werden beim Bestätigen nicht gemerkt. In den Einstellungen aktivierbar.";

  const content = `
      <div class="page-head">
        <div>
          <h1 class="greet">Angebot importieren</h1>
          <p class="sub">Lies alte Angebote ein — AuftragsBoss übernimmt daraus deine Preise und Positionen.</p>
        </div>
      </div>

      <div class="section">
        <div class="section-h"><h2>Alte Angebote einlesen</h2><p>Nur deine Texte werden gelesen — das neue Angebot entsteht immer im AuftragsBoss-Stil. Mehrere Dateien auf einmal möglich. PDF oder Word (.docx), je max. 15&nbsp;MB.</p></div>
        <div class="section-b">
          <label class="dropzone" id="dz" for="datei">
            <input id="datei" type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
            <span class="dz-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></span>
            <span class="dz-title">Dateien hierher ziehen oder <u>auswählen</u></span>
            <span class="dz-sub">PDF oder Word · bis 15 MB je Datei</span>
          </label>
          <div id="dateiliste" class="dz-picked"></div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:16px;flex-wrap:wrap;">
            <button class="btn prim" id="btn" onclick="hochladen()">Hochladen &amp; auslesen</button>
            <button class="btn" id="bestaetigen" onclick="bestaetigen()" style="display:none">Alle bestätigen</button>
            <span class="statusmsg" id="status"></span>
          </div>
          <p id="gedaechtnis" class="hint" style="display:none;margin-top:12px;">${gedaechtnisHinweis}</p>
          <div id="liste" class="import-results"></div>
        </div>
      </div>`;

  const headExtra = `
  .dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;
    border:1.5px dashed var(--line-2);border-radius:var(--r-lg);background:var(--panel-2);padding:36px 20px;cursor:pointer;transition:border-color .15s,background .15s;}
  .dropzone:hover{border-color:var(--ink-2);}
  .dropzone.over{border-color:var(--primary);background:#eef1f5;}
  .dz-ic{color:var(--faint);} .dz-ic svg{width:34px;height:34px;}
  .dz-title{font-size:15px;font-weight:600;color:var(--ink-2);} .dz-title u{color:var(--ink);text-decoration:none;border-bottom:1.5px solid var(--ink-2);}
  .dz-sub{font-size:12.5px;color:var(--faint);}
  .dz-picked{font-size:13px;color:var(--muted);margin-top:12px;}
  .import-results{margin-top:16px;display:flex;flex-direction:column;gap:8px;}
  .ir-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel-2);}
  .ir-row .ir-name{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;}`;

  const scriptExtra = `
const TOKEN=${JSON.stringify(token)};
let importIds=[];
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s).replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

// Drag & Drop
const dz=$('dz'), inp=$('datei');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over');}));
['dragleave','dragend'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over');}));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');if(e.dataTransfer&&e.dataTransfer.files.length){inp.files=e.dataTransfer.files;zeigeDateien();}});
inp.addEventListener('change',zeigeDateien);
function zeigeDateien(){
  const n=inp.files.length;
  $('dateiliste').innerHTML = n ? (n+' Datei(en) gewählt: '+[].map.call(inp.files,f=>esc(f.name)).join(', ')) : '';
}

async function hochladen(){
  const btn=$('btn'),liste=$('liste'),st=$('status');
  $('bestaetigen').style.display='none';$('gedaechtnis').style.display='none';importIds=[];liste.innerHTML='';st.textContent='';
  if(!inp.files.length){st.textContent='Bitte zuerst Dateien wählen.';st.style.color='var(--warn)';return;}
  const fd=new FormData();
  for(const f of inp.files) fd.append('datei',f);
  btn.disabled=true;st.style.color='var(--muted)';st.textContent='Wird ausgelesen … ('+inp.files.length+' Datei(en))';
  try{
    const r=await fetch('/api/import/'+TOKEN,{method:'POST',body:fd});
    const j=await r.json();
    if(!r.ok){st.style.color='#c0261a';st.textContent='Fehler: '+(j.fehler||r.status);return;}
    let ok=0;
    liste.innerHTML=(j.ergebnisse||[]).map((e)=>{
      if(e.fehler) return '<div class="ir-row"><span class="ir-name">'+esc(e.dateiname)+'</span><span class="badge warn">'+esc(e.fehler)+'</span></div>';
      ok++; if(e.importDokumentId) importIds.push(e.importDokumentId);
      const badge=e.manuellePruefungNoetig?'<span class="badge warn">bitte prüfen</span>':'<span class="badge ok">'+e.anzahlPositionen+' Position(en)</span>';
      return '<div class="ir-row"><span class="ir-name">'+esc(e.dateiname)+'</span>'+badge+'</div>';
    }).join('');
    st.style.color='var(--muted)';st.textContent=ok+' von '+(j.ergebnisse||[]).length+' Datei(en) eingelesen.';
    if(importIds.length){$('bestaetigen').style.display='inline-flex';$('gedaechtnis').style.display='block';}
  }catch(e){st.style.color='#c0261a';st.textContent='Netzwerkfehler: '+e;}
  finally{btn.disabled=false;}
}
async function bestaetigen(){
  if(!importIds.length)return;
  const b=$('bestaetigen'),st=$('status');
  b.disabled=true;st.style.color='var(--muted)';st.textContent='Wird bestätigt …';
  let summe=0,aus=false,fehler=0;const anzahl=importIds.length;
  for(const id of importIds){
    try{
      const r=await fetch('/api/import/'+TOKEN+'/bestaetigen/'+encodeURIComponent(id),{method:'POST'});
      const j=await r.json();
      if(!r.ok){fehler++;continue;}
      if(j.preisgedaechtnisAus)aus=true; else summe+=(j.uebernommen||0);
    }catch(e){fehler++;}
  }
  st.style.color='var(--ok)';
  st.textContent = aus
    ? (anzahl+' Angebot(e) bestätigt. Preisgedächtnis ist aus — es wurden keine Preise gemerkt.')
    : (anzahl+' Angebot(e) bestätigt · '+summe+' Preis(e) ins Preisgedächtnis übernommen (datiert).');
  if(fehler) st.textContent+=' ('+fehler+' mit Fehler)';
  b.style.display='none';$('gedaechtnis').style.display='none';importIds=[];
}
window.hochladen=hochladen; window.bestaetigen=bestaetigen;
`;

  return appShell({
    token,
    aktiv: "import",
    handwerker,
    titel: "Angebot importieren",
    content,
    headExtra,
    scriptExtra,
  });
}
