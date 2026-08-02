// Prüft den Nachtrag: erst diktieren, dann per zweiter Nachricht nachbessern.
//
// Genau der Ablauf, der dem Handwerker das Bearbeiten der Word-Tabelle
// erspart — Positionen ergänzen und Preise nachreichen per Sprache.
//
// Aufruf: npm run test:nachtrag
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { strukturiereDialog, type DialogNachricht } from "./ai/structure.js";
import { ladePreisliste } from "./preisliste.js";
import { berechneAngebot, euro, mengeMitEinheit } from "./angebot/berechnung.js";
import { erzeugeAngebotWord, schreibeWordDatei, wordDateiname } from "./angebot/word.js";

const ERSTES_DIKTAT =
  "Familie Bär, Musterstraße 5. Wohnzimmer tapezieren, ca. 45 Quadratmeter, " +
  "Deckenhöhe 2,50. Vorher die alte Tapete runter machen, Decke spachteln, " +
  "Malervlies an die Decke, an den Wänden Löcher zumachen und ein bisschen schleifen.";

const NACHTRAG =
  "Ach, die Fensterrahmen sollen auch noch gestrichen werden, das sind fünf Stück. " +
  "Und die Preise: tapezieren machen wir für 14 Euro den Quadratmeter, " +
  "spachteln 9 Euro 80, schleifen 4 Euro 20, Tapete entfernen 6 Euro 50 " +
  "und das Malervlies 11 Euro. Die Kabelkanäle lassen wir weg.";

const linie = (z = "─") => z.repeat(70);

function zeigePositionen(summe: ReturnType<typeof berechneAngebot>): void {
  const LEER = "________ €";
  let kategorie = "";
  for (const p of summe.positionen) {
    if (p.kategorie !== kategorie) {
      kategorie = p.kategorie;
      console.log(`\n── ${kategorie === "MATERIAL" ? "MATERIAL" : "LEISTUNGEN"}`);
    }
    const menge = (p.menge !== null || p.einheit === "pauschal"
      ? mengeMitEinheit(p.menge, p.einheit)
      : `____ ${p.einheit ?? ""}`
    ).padStart(12);
    const einzel = (p.einzelpreis !== null ? euro(p.einzelpreis) : LEER).padStart(12);
    const gesamt = (p.gesamt !== null ? euro(p.gesamt) : LEER).padStart(13);
    console.log(`${String(p.nummer).padStart(2)}. ${p.beschreibung}`);
    console.log(`    ${menge} ×${einzel}  =${gesamt}`);
  }
  const teil = (t: { netto: number; vollstaendig: boolean }) =>
    t.vollstaendig ? euro(t.netto) : LEER;
  const wert = (b: number) => (summe.vollstaendig ? euro(b) : LEER);

  console.log(linie());
  if (summe.material.anzahl > 0) {
    console.log(`${"Zwischensumme Arbeitsaufwand".padEnd(38)}${teil(summe.leistungen).padStart(15)}`);
    console.log(`${"Zwischensumme Material".padEnd(38)}${teil(summe.material).padStart(15)}`);
  }
  console.log(`${"Nettosumme".padEnd(38)}${wert(summe.netto).padStart(15)}`);
  console.log(`${`zzgl. ${summe.mwstSatz} % MwSt.`.padEnd(38)}${wert(summe.mwstBetrag).padStart(15)}`);
  console.log(`${"GESAMT (brutto)".padEnd(38)}${wert(summe.brutto).padStart(15)}`);
  console.log(linie());
  if (!summe.vollstaendig && summe.bereitsBepreist > 0) {
    console.log(
      `Zwischenstand (nur für dich): ${euro(summe.bereitsBepreist)} netto aus ` +
        `${summe.positionen.length - summe.anzahlOffen} von ${summe.positionen.length} Positionen.`,
    );
  }
}

async function main(): Promise<void> {
  const preisliste = ladePreisliste();
  const verlauf: DialogNachricht[] = [{ rolle: "handwerker", text: ERSTES_DIKTAT }];

  // ── Runde 1: Erstes Diktat ──────────────────────────────
  console.log(linie("═"));
  console.log("RUNDE 1 — erstes Diktat");
  console.log(linie("═"));
  console.log(`🎙️  "${ERSTES_DIKTAT}"\n`);

  let start = Date.now();
  const ersteFassung = await strukturiereDialog(verlauf, preisliste);
  console.log(`🤖 fertig in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  const summe1 = berechneAngebot(ersteFassung.positionen, preisliste);
  zeigePositionen(summe1);

  // ── Runde 2: Nachtrag ───────────────────────────────────
  verlauf.push({ rolle: "assistent", text: `Angebot erstellt: ${summe1.positionen.length} Positionen.` });
  verlauf.push({ rolle: "handwerker", text: NACHTRAG });

  console.log("\n" + linie("═"));
  console.log("RUNDE 2 — Nachtrag per Sprachnachricht");
  console.log(linie("═"));
  console.log(`🎙️  "${NACHTRAG}"\n`);

  start = Date.now();
  const zweiteFassung = await strukturiereDialog(verlauf, preisliste);
  console.log(`🤖 fertig in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  const summe2 = berechneAngebot(zweiteFassung.positionen, preisliste);
  zeigePositionen(summe2);

  // ── Auswertung ──────────────────────────────────────────
  const text = (s: typeof summe2) => s.positionen.map((p) => p.beschreibung.toLowerCase()).join(" | ");
  const pruefungen = [
    { was: "Fensterrahmen ergänzt", ok: /fenster/.test(text(summe2)) },
    { was: "Kabelkanäle entfernt", ok: !/kabelkan/.test(text(summe2)) },
    { was: "Preise übernommen", ok: summe2.positionen.some((p) => p.einzelpreis !== null) },
    { was: "Summen berechnet", ok: summe2.netto > 0 },
    {
      was: "Alte Tapete weiterhin enthalten",
      ok: /tapete entfernen|alte tapete/.test(text(summe2)),
    },
  ];

  console.log("\n" + linie("═"));
  console.log("AUSWERTUNG DES NACHTRAGS");
  console.log(linie("═"));
  for (const p of pruefungen) console.log(`   ${p.ok ? "✅" : "❌"} ${p.was}`);

  // Word-Datei der aktualisierten Fassung
  const nummer = `ANG-${new Date().getFullYear()}-NACHTRAG`;
  const word = await erzeugeAngebotWord({
    daten: zweiteFassung,
    summe: summe2,
    preisliste,
    nummer,
    datum: new Date(),
  });
  const ordner = resolve("demo-ausgabe");
  mkdirSync(ordner, { recursive: true });
  const pfad = schreibeWordDatei(
    resolve(ordner, wordDateiname(zweiteFassung.art, nummer, zweiteFassung.kunde.name)),
    word,
  );
  console.log(`\n📎 Aktualisierte Word-Datei:\n   ${pfad}`);

  const fehler = pruefungen.filter((p) => !p.ok).length;
  console.log("\n" + linie("═"));
  console.log(fehler === 0 ? "✅ Nachtrag vollständig eingearbeitet." : `❌ ${fehler} Prüfung(en) fehlgeschlagen.`);
  console.log(linie("═"));
  if (fehler > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ Test fehlgeschlagen:\n", err instanceof Error ? err.message : err);
  process.exit(1);
});
