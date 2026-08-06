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
import { cockpitLink } from "./tokens.js";

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
      select: { id: true, firma: true, preisGedaechtnisAktiv: true },
    });
    if (!handwerker) return reply.code(404).type("text/html").send("<h1>Nicht gefunden</h1>");
    return reply
      .type("text/html; charset=utf-8")
      .send(importSeite(req.params.token, handwerker.firma, handwerker.preisGedaechtnisAktiv));
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

/** Minimale, in sich geschlossene Upload-Seite (kein Framework). */
function importSeite(token: string, firma: string, preisGedaechtnisAktiv: boolean): string {
  const sicher = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const gedaechtnisHinweis = preisGedaechtnisAktiv
    ? "Nach dem Bestätigen merkt sich AuftragsBoss Ihre Preise (datiert) und schlägt sie beim nächsten Angebot vor."
    : "Ihr Preisgedächtnis ist ausgeschaltet — Preise werden beim Bestätigen nicht gemerkt. In den Einstellungen aktivierbar.";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Altes Angebot importieren</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;color:#1c1c1c;background:#fafafa}
  h1{font-size:1.4rem}
  .karte{background:#fff;border:1px solid #e2e2e2;border-radius:12px;padding:1.5rem;margin-top:1rem}
  input[type=file]{width:100%;padding:.75rem;border:1px dashed #bbb;border-radius:8px;background:#fafafa}
  button{margin-top:1rem;background:#0B5CAD;color:#fff;border:0;border-radius:8px;padding:.75rem 1.25rem;font-size:1rem;cursor:pointer}
  button.zweit{background:#0a7d33}
  button:disabled{opacity:.5;cursor:default}
  .hinweis{color:#555;font-size:.9rem}
  .zurueck{display:inline-block;margin-bottom:1rem;color:#0B5CAD;text-decoration:none;font-size:.95rem}
  .zurueck:hover{text-decoration:underline}
  #liste{margin-top:1rem}
  .zeile{border-top:1px solid #eee;padding:.5rem 0;font-size:.9rem}
  .zeile:first-child{border-top:0}
  .zeile .dn{font-weight:600}
  .ok{color:#0a7d33}.warn{color:#b26a00}.err{color:#c0261a}
</style></head><body>
<a class="zurueck" href="${cockpitLink(token)}">← Übersicht</a>
<h1>Altes Angebot importieren</h1>
<p class="hinweis">Betrieb: <strong>${sicher(firma)}</strong>. Nur Ihre Texte werden gelesen &mdash; das neue Angebot entsteht immer im AuftragsBoss-Stil. Sie können mehrere Dateien auf einmal wählen. PDF oder Word (.docx), je max. 15&nbsp;MB.</p>
<div class="karte">
  <input id="datei" type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
  <button id="btn" onclick="hochladen()">Hochladen &amp; auslesen</button>
  <div id="liste"></div>
  <div id="status" class="hinweis" style="margin-top:.8rem"></div>
  <button id="bestaetigen" class="zweit" onclick="bestaetigen()" style="display:none">Alle bestätigen</button>
  <p id="gedaechtnis" class="hinweis" style="display:none">${gedaechtnisHinweis}</p>
</div>
<script>
const TOKEN=${JSON.stringify(token)};
let importIds=[];
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s).replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
async function hochladen(){
  const inp=$('datei'),btn=$('btn'),liste=$('liste'),st=$('status');
  $('bestaetigen').style.display='none';$('gedaechtnis').style.display='none';importIds=[];liste.innerHTML='';st.textContent='';
  if(!inp.files.length){st.className='hinweis warn';st.textContent='Bitte zuerst eine oder mehrere Dateien wählen.';return;}
  const fd=new FormData();
  for(const f of inp.files) fd.append('datei',f);
  btn.disabled=true;st.className='hinweis';st.textContent='Wird ausgelesen … ('+inp.files.length+' Datei(en))';
  try{
    const r=await fetch('/api/import/'+TOKEN,{method:'POST',body:fd});
    const j=await r.json();
    if(!r.ok){st.className='hinweis err';st.textContent='Fehler: '+(j.fehler||r.status);return;}
    let ok=0;
    liste.innerHTML=(j.ergebnisse||[]).map((e)=>{
      if(e.fehler) return '<div class="zeile err"><span class="dn">'+esc(e.dateiname)+'</span> — '+esc(e.fehler)+'</div>';
      ok++; if(e.importDokumentId) importIds.push(e.importDokumentId);
      const cls=e.manuellePruefungNoetig?'warn':'ok';
      const extra=e.manuellePruefungNoetig?' · bitte prüfen':'';
      return '<div class="zeile '+cls+'"><span class="dn">'+esc(e.dateiname)+'</span> — '+e.anzahlPositionen+' Position(en)'+extra+'</div>';
    }).join('');
    st.className='hinweis';st.textContent=ok+' von '+(j.ergebnisse||[]).length+' Datei(en) eingelesen.';
    if(importIds.length){$('bestaetigen').style.display='inline-block';$('gedaechtnis').style.display='block';}
  }catch(e){st.className='hinweis err';st.textContent='Netzwerkfehler: '+e;}
  finally{btn.disabled=false;}
}
async function bestaetigen(){
  if(!importIds.length)return;
  const b=$('bestaetigen'),st=$('status');
  b.disabled=true;st.className='hinweis';st.textContent='Wird bestätigt …';
  let summe=0,aus=false,fehler=0;const anzahl=importIds.length;
  for(const id of importIds){
    try{
      const r=await fetch('/api/import/'+TOKEN+'/bestaetigen/'+encodeURIComponent(id),{method:'POST'});
      const j=await r.json();
      if(!r.ok){fehler++;continue;}
      if(j.preisgedaechtnisAus)aus=true; else summe+=(j.uebernommen||0);
    }catch(e){fehler++;}
  }
  st.className='hinweis ok';
  st.textContent = aus
    ? (anzahl+' Angebot(e) bestätigt. Preisgedächtnis ist aus — es wurden keine Preise gemerkt.')
    : (anzahl+' Angebot(e) bestätigt · '+summe+' Preis(e) ins Preisgedächtnis übernommen (datiert).');
  if(fehler) st.textContent+=' ('+fehler+' mit Fehler)';
  b.style.display='none';$('gedaechtnis').style.display='none';importIds=[];
}
</script>
</body></html>`;
}
