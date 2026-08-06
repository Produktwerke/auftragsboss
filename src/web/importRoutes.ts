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

export async function importRoutes(app: FastifyInstance): Promise<void> {
  // Baustein komplett aus: keine Routen registrieren.
  if (!featureConfig().FEATURE_IMPORT) return;

  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_BYTES },
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

  // ── Upload verarbeiten ────────────────────────────────
  app.post<{ Params: { token: string } }>("/api/import/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
      select: { id: true },
    });
    if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

    const datei = await req.file();
    if (!datei) return reply.code(400).send({ fehler: "Keine Datei hochgeladen." });

    const buffer = await datei.toBuffer();
    // @fastify/multipart markiert bei Überschreitung das Feld als abgeschnitten.
    if (datei.file.truncated) {
      return reply.code(413).send({ fehler: `Datei zu groß (max. ${MAX_BYTES / 1024 / 1024} MB).` });
    }

    try {
      const ergebnis = await importiereAltangebot(
        prisma,
        handwerker.id,
        buffer,
        datei.filename,
        datei.mimetype,
      );
      return reply.send({ ok: true, ...ergebnis });
    } catch (err) {
      if (err instanceof ImportFormatFehler) {
        return reply.code(415).send({ fehler: err.message });
      }
      req.log.error(err, "Altangebot-Import fehlgeschlagen");
      return reply.code(500).send({ fehler: "Import fehlgeschlagen. Bitte später erneut versuchen." });
    }
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
  #ergebnis{margin-top:1rem;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:.85rem}
  #bestaetigen{display:none}
  .ok{color:#0a7d33}.warn{color:#b26a00}.err{color:#c0261a}
</style></head><body>
<a class="zurueck" href="${cockpitLink(token)}">← Übersicht</a>
<h1>Altes Angebot importieren</h1>
<p class="hinweis">Betrieb: <strong>${sicher(firma)}</strong>. Nur Ihre Texte werden gelesen &mdash; das neue Angebot entsteht immer im AuftragsBoss-Stil. PDF oder Word (.docx), max. 15&nbsp;MB.</p>
<div class="karte">
  <input id="datei" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
  <button id="btn" onclick="hochladen()">Hochladen &amp; auslesen</button>
  <div id="ergebnis"></div>
  <button id="bestaetigen" class="zweit" onclick="bestaetigen()">Bestätigen</button>
  <p id="gedaechtnis" class="hinweis" style="display:none">${gedaechtnisHinweis}</p>
</div>
<script>
let importId=null;
const $=(id)=>document.getElementById(id);
async function hochladen(){
  const inp=$('datei'),btn=$('btn'),out=$('ergebnis');
  $('bestaetigen').style.display='none';$('gedaechtnis').style.display='none';importId=null;
  if(!inp.files.length){out.className='warn';out.textContent='Bitte zuerst eine Datei wählen.';return;}
  const fd=new FormData();fd.append('datei',inp.files[0]);
  btn.disabled=true;out.className='';out.textContent='Wird ausgelesen …';
  try{
    const r=await fetch(${JSON.stringify(`/api/import/${token}`)},{method:'POST',body:fd});
    const j=await r.json();
    if(!r.ok){out.className='err';out.textContent='Fehler: '+(j.fehler||r.status);}
    else{
      out.className=j.manuellePruefungNoetig?'warn':'ok';
      let t=j.anzahlPositionen+' Position(en) erkannt.';
      if(j.manuellePruefungNoetig)t+='\\nBitte manuell prüfen.';
      if(j.warnungen&&j.warnungen.length)t+='\\n- '+j.warnungen.join('\\n- ');
      out.textContent=t;
      importId=j.importDokumentId;
      if(importId){$('bestaetigen').style.display='inline-block';$('gedaechtnis').style.display='block';}
    }
  }catch(e){out.className='err';out.textContent='Netzwerkfehler: '+e;}
  finally{btn.disabled=false;}
}
async function bestaetigen(){
  if(!importId)return;
  const b=$('bestaetigen'),out=$('ergebnis');
  b.disabled=true;
  try{
    const r=await fetch(${JSON.stringify(`/api/import/${token}/bestaetigen/`)}+encodeURIComponent(importId),{method:'POST'});
    const j=await r.json();
    if(!r.ok){out.className='err';out.textContent='Fehler: '+(j.fehler||r.status);}
    else{
      out.className='ok';
      out.textContent=j.preisgedaechtnisAus?j.hinweis:('Bestätigt. '+j.uebernommen+' Preis(e) ins Preisgedächtnis übernommen (datiert).');
      b.style.display='none';$('gedaechtnis').style.display='none';
    }
  }catch(e){out.className='err';out.textContent='Netzwerkfehler: '+e;}
  finally{b.disabled=false;}
}
</script>
</body></html>`;
}
