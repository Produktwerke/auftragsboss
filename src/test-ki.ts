// KI-Testlauf OHNE WhatsApp, ohne E-Mail, ohne Datenbank.
//
// Zeigt, was aus einem Diktat wird — Angebot oder Protokoll, je nachdem
// was diktiert wurde. Das ist die Kernfrage: Ist das gut genug, um damit
// zum Kunden zu gehen?
//
// Aufruf:
//   npm run test:ki                          → eingebautes Beispiel-Diktat
//   npm run test:ki -- transkript.txt        → eigener getippter Text
//   npm run test:ki -- sprachmemo.mp3        → echte Sprachaufnahme (+ OpenAI-Key)
import { readFileSync } from "node:fs";
import { strukturiereTranskript } from "./ai/structure.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { ladePreisliste } from "./preisliste.js";
import { berechneAngebot, euro, mengeMitEinheit } from "./angebot/berechnung.js";

const BEISPIEL_DIKTAT = `
So, ich war gerade bei Familie Bär, Rotberg 18. Wohnzimmer tapezieren,
ca. 45 Quadratmeter, Deckenhöhe 2,50. Tapete nach Wahl. Decken spachteln,
vorher Tapete runter machen, Malervlies an die Decke. Wohnzimmer hat 5 Fenster,
davon sind 3 Balkontüren, 1,70 Meter breit die Türen. An den Wänden Löcher
zumachen, Kabelkanäle zuspachteln, ein bisschen schleifen und das wars eigentlich.
`.trim();

const AUDIO_ENDUNGEN = ["ogg", "oga", "opus", "m4a", "mp3", "wav", "webm", "mp4"];
const linie = (z = "─") => z.repeat(70);
const deDatum = (d: Date) => d.toLocaleDateString("de-DE");

async function main(): Promise<void> {
  const arg = process.argv[2];
  let transkript: string;

  if (!arg) {
    console.log("ℹ️  Kein Argument übergeben — nutze das eingebaute Beispiel-Diktat.\n");
    transkript = BEISPIEL_DIKTAT;
  } else {
    const endung = arg.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_ENDUNGEN.includes(endung)) {
      console.log(`🎙️  Transkribiere Audiodatei: ${arg} …`);
      const start = Date.now();
      transkript = await transkribiereAudio(readFileSync(arg), arg);
      console.log(`   fertig in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
    } else {
      console.log(`📄 Lese Textdatei: ${arg}\n`);
      transkript = readFileSync(arg, "utf-8").trim();
    }
  }

  const preisliste = ladePreisliste();

  console.log(linie("═"));
  console.log("EINGABE — Rohtext des Diktats");
  console.log(linie("═"));
  console.log(transkript);

  console.log("\n🤖 Claude strukturiert das Diktat …");
  const start = Date.now();
  const d = await strukturiereTranskript(transkript, preisliste);
  console.log(`   fertig in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);

  const istAngebot = d.art === "ANGEBOT";
  console.log(linie("═"));
  console.log(`ERKANNTE ART: ${istAngebot ? "📄 ANGEBOT (Arbeiten noch offen)" : "📋 PROTOKOLL (Arbeiten erledigt)"}`);
  console.log(linie("═"));
  console.log(`Kunde:   ${d.kunde.name ?? "—"}${d.kunde.adresse ? ` · ${d.kunde.adresse}` : ""}`);
  console.log(`Gewerk:  ${d.gewerk ?? "—"}`);
  console.log(`Objekt:  ${d.objekt ?? "—"}`);

  // ── Positionen mit Preisen ──────────────────────────────
  const summe = berechneAngebot(d.positionen, preisliste);

  console.log("\n" + linie("═"));
  console.log(istAngebot ? "POSITIONEN & PREISE" : "AUSGEFÜHRTE LEISTUNGEN");
  console.log(linie("═"));

  const LEER = "________ €";

  for (const p of summe.positionen) {
    const menge = (p.menge !== null || p.einheit === "pauschal"
      ? mengeMitEinheit(p.menge, p.einheit)
      : `____ ${p.einheit ?? ""}`
    ).padStart(12);
    const einzel = (p.einzelpreis !== null ? euro(p.einzelpreis) : LEER).padStart(12);
    const gesamt = (p.gesamt !== null ? euro(p.gesamt) : LEER).padStart(13);
    const quelle = p.einzelpreis !== null ? `   [${p.preisquelle.toLowerCase()}]` : "";
    console.log(`${String(p.nummer).padStart(2)}. ${p.beschreibung}${p.mengeUnsicher ? " ≈" : ""}`);
    console.log(`    ${menge} ×${einzel}  =${gesamt}${quelle}`);
  }

  const wert = (betrag: number) => (summe.vollstaendig ? euro(betrag) : LEER);
  console.log(linie());
  console.log(`${"Nettosumme".padEnd(38)}${wert(summe.netto).padStart(15)}`);
  console.log(`${`zzgl. ${summe.mwstSatz} % MwSt.`.padEnd(38)}${wert(summe.mwstBetrag).padStart(15)}`);
  console.log(`${"GESAMT (brutto)".padEnd(38)}${wert(summe.brutto).padStart(15)}`);
  console.log(linie());

  if (summe.ohnePreise) {
    console.log("\n✏️  Alle Preisspalten offen — Gerüst zum Ausfüllen (Regelfall beim Diktat im Auto).");
  } else if (!summe.vollstaendig) {
    console.log(`\n✏️  ${summe.anzahlOffen} von ${summe.positionen.length} Positionen ohne Preis.`);
  }
  if (istAngebot) console.log(`\n📅 Angebot gültig bis: ${deDatum(summe.gueltigBis)}`);

  // ── Textbausteine fürs Kundendokument ───────────────────
  console.log("\n" + linie("═"));
  console.log("ANSCHREIBEN — Einleitung");
  console.log(linie("═"));
  console.log(d.einleitung);
  console.log("\n" + linie("═"));
  console.log("ANSCHREIBEN — Schlusstext");
  console.log(linie("═"));
  console.log(d.schlusstext);

  // ── Interne Notizen ─────────────────────────────────────
  console.log("\n" + linie("═"));
  console.log("INTERNE NOTIZEN");
  console.log(linie("═"));
  console.log(`📐 Aufmaß:         ${d.aufmassNotizen ?? "—"}`);
  console.log(`⚠️  Besonderheiten: ${d.besonderheiten ?? "—"}`);
  console.log(`📅 Folgetermin:    ${d.folgetermin ?? "—"}`);

  if (d.rueckfragen.length > 0) {
    console.log("\n" + linie("═"));
    console.log("❓ VOR DEM VERSAND PRÜFEN");
    console.log(linie("═"));
    for (const f of d.rueckfragen) console.log(`   • ${f}`);
  }

  if (d.gewaehrleistung) {
    const jahre = d.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
    const ablauf = new Date();
    ablauf.setFullYear(ablauf.getFullYear() + jahre);
    const vorwarnung = new Date(ablauf);
    vorwarnung.setMonth(vorwarnung.getMonth() - 3);
    console.log("\n" + linie("═"));
    console.log("GEWÄHRLEISTUNGS-TRACKING");
    console.log(linie("═"));
    console.log(`Frist:       ${jahre} Jahre (§ 634a BGB)`);
    console.log(`Begründung:  ${d.gewaehrleistung.begruendung}`);
    console.log(`Läuft ab:    ${deDatum(ablauf)}`);
    console.log(`🔔 Erinnerung: ${deDatum(vorwarnung)} — Wartungsangebot machen!`);
  }

  console.log("\n" + linie());
  console.log("✅ Testlauf erfolgreich. Kosten: ca. 5–15 Cent.");
  console.log(linie());
}

main().catch((err) => {
  const text = String(err);
  console.error("\n❌ Testlauf fehlgeschlagen:\n");
  console.error(err instanceof Error ? err.message : err);
  if (text.includes("authentication") || text.includes("401")) {
    console.error("\n→ Der API-Key in der .env-Datei scheint falsch zu sein.");
  }
  process.exit(1);
});
