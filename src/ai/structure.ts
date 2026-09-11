// Schritt 2 der KI-Pipeline: Transkript → strukturiertes Dokument.
//
// Claude Opus 4.8 mit Structured Outputs (Zod-Schema) — die Antwort ist
// GARANTIERT valides JSON im erwarteten Format, kein Parsing-Risiko.
//
// Zwei Fälle, automatisch erkannt:
//   ANGEBOT    — diktiert nach dem Beratungstermin, Arbeiten noch offen
//   PROTOKOLL  — diktiert nach getaner Arbeit, Dokumentation + Gewährleistung
//
// WICHTIG: Die KI rechnet NICHT. Sie liefert nur Menge und Einzelpreis;
// alle Summen und die MwSt. berechnet der Code (siehe angebot/berechnung.ts).
// Und sie erfindet keine Preise — unbekannt bleibt unbekannt.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicConfig, featureConfig } from "../config.js";
import { malerFachwissen } from "../maler/prompt.js";
import { EINHEITEN, preislisteAlsText, type Preisliste } from "../preisliste.js";

export const PositionSchema = z.object({
  kategorie: z
    .enum(["LEISTUNG", "MATERIAL"])
    .describe(
      "LEISTUNG: eine Arbeit, die ausgeführt wird. MATERIAL: ein Werkstoff, der dafür gebraucht wird. " +
        "Material erscheint im Angebot in einem eigenen Block.",
    ),
  vorschlag: z
    .boolean()
    .describe(
      "true, wenn diese Position NICHT diktiert wurde, sondern von dir aus dem Handwerkskontext ergänzt " +
        "wurde (typischerweise Material). Wird im Angebot sichtbar als Vorschlag gekennzeichnet, damit der " +
        "Handwerker bewusst entscheidet. false für alles, was im Diktat genannt wurde.",
    ),
  beschreibung: z.string().describe("Klare Bezeichnung der Leistung, wie sie im Angebot stehen soll."),
  menge: z
    .number()
    .nullable()
    .describe(
      "Zahlenwert der Menge, z.B. 45 für '45 Quadratmeter'. Bei pauschalen Arbeitsleistungen 1. " +
        "null, wenn keine Menge genannt wurde und die Einheit nicht pauschal ist.",
    ),
  einheit: z
    .enum(EINHEITEN)
    .nullable()
    .describe(
      "m2 (Fläche), lfm (laufender Meter), Stk (Stück), Std (Stunden) oder pauschal. Für Arbeitsleistungen " +
        "(kategorie LEISTUNG) ist 'pauschal' der Standard — m²/Stk/Std nur, wenn ausdrücklich für genau diese " +
        "Leistung diktiert. Bei MATERIAL die fachlich passende Einheit. null nur, wenn wirklich unklar.",
    ),
  einzelpreis: z
    .number()
    .nullable()
    .describe(
      "Preis pro Einheit in Euro. NUR setzen, wenn er im Diktat ausdrücklich genannt wurde ODER in der " +
        "Preisliste steht. null ist der Normalfall und völlig in Ordnung — der Handwerker trägt den Preis " +
        "später am Schreibtisch ein. Niemals schätzen oder aus Erfahrung ergänzen.",
    ),
  preisquelle: z
    .enum(["DIKTAT", "PREISLISTE", "PREISGEDAECHTNIS", "MANUELL", "UNBEKANNT"])
    .describe(
      "Woher der Einzelpreis stammt. Du als KI setzt NUR eines von: DIKTAT (im Diktat ausdrücklich " +
        "genannt), PREISLISTE (steht in der hinterlegten Preisliste) oder UNBEKANNT (einzelpreis null). " +
        "PREISGEDAECHTNIS und MANUELL setzt ausschließlich die Anwendung, niemals du.",
    ),
  mengeUnsicher: z
    .boolean()
    .describe("true, wenn die Menge geschätzt/abgeleitet wurde statt klar diktiert (z.B. aus Raumangaben gerechnet)."),
  flaechenArt: z
    .enum(["WAND", "DECKE"])
    .nullable()
    .describe("Nur bei Flächenleistungen an Wänden/Decke eines Raums aus raeumeText. Sonst null."),
  raumBezug: z
    .string()
    .nullable()
    .describe(
      "Raum, zu dem diese Position gehört, exakt wie in raeumeText geschrieben; bei Leistungen UND Material dieses Raums. " +
        "null für Raumübergreifendes (Klein-/Hilfsmaterial, Anfahrt, Abdeckarbeiten für alles).",
    ),
});

export const DokumentSchema = z.object({
  art: z
    .enum(["ANGEBOT", "PROTOKOLL"])
    .describe(
      "ANGEBOT: Der Handwerker beschreibt Arbeiten, die noch AUSGEFÜHRT WERDEN SOLLEN (Aufmaß, Beratungstermin, " +
        "Kundenwunsch, Zukunftsform, Preisangaben). PROTOKOLL: Der Handwerker beschreibt bereits ERLEDIGTE " +
        "Arbeiten (Vergangenheitsform, 'haben wir gemacht', Hinweise an den Kunden nach Ausführung). " +
        "Im Zweifel ANGEBOT.",
    ),
  kunde: z.object({
    name: z.string().nullable().describe("Kundenname, z.B. 'Familie Bär'. null wenn nicht genannt."),
    strasse: z
      .string()
      .nullable()
      .describe("Straße und Hausnummer, z.B. 'Musterstraße 5'. null wenn nicht genannt."),
    plzOrt: z
      .string()
      .nullable()
      .describe("PLZ und Ort, z.B. '12345 Musterstadt'. null wenn nicht genannt — nicht raten."),
  }),
  gewerk: z.string().nullable().describe("Gewerk, z.B. 'Malerei', 'Sanitär'."),
  objekt: z
    .string()
    .nullable()
    .describe(
      "Kurzbezeichnung des Objekts, nur Raum- oder Gebäudenamen: 'Wohnzimmer' oder 'Kinderzimmer links, Kinderzimmer rechts und Dachzimmer'. " +
        "KEINE Maße, Höhen, Paneel- oder Flächenangaben (die stehen im Aufmaßblatt).",
    ),
  positionen: z
    .array(PositionSchema)
    .describe(
      "Erst alle LEISTUNGEN in sinnvoller Ausführungsreihenfolge, danach das zugehörige MATERIAL.",
    ),
  dialog: z
    .object({
      aktion: z
        .enum(["NACHFRAGEN", "ABSCHLIESSEN"])
        .describe(
          "NACHFRAGEN: Es fehlt eine Pflichtangabe UND es ist realistisch, dass der Handwerker sie gerade " +
            "liefern kann. ABSCHLIESSEN: alles Nötige da, ODER er weicht aus / vertagt / weiß es nicht / " +
            "geht auf die Frage nicht ein. Im Zweifel ABSCHLIESSEN — lieber ein Entwurf zum Nacharbeiten " +
            "als ein genervter Handwerker.",
        ),
      nachricht: z
        .string()
        .describe(
          "Die WhatsApp-Nachricht an den Handwerker. Du-Form, knapp, ohne Floskeln, wie von einem " +
            "hilfsbereiten Kollegen.\n" +
            "Bei NACHFRAGEN: die fehlenden Punkte als kurze nummerierte Liste. Kein Hinweis auf Zauberwörter.\n" +
            "Bei ABSCHLIESSEN nach einem Ausweichen: eine kurze Bestätigung, die das Vertagen aufgreift und " +
            "sagt, was jetzt passiert — z.B. 'Alles klar, ich schick dir schon mal einen Entwurf. Die " +
            "Adresse kannst du in der Word-Datei direkt ergänzen.'\n" +
            "Bei ABSCHLIESSEN ohne offene Punkte: leerer String (das Programm meldet die Fertigstellung selbst).",
        ),
    })
    .describe("Wie es im WhatsApp-Dialog weitergeht."),
  fehlendeInfos: z
    .array(
      z.object({
        feld: z.string().describe("Kurzname der fehlenden Angabe, z.B. 'Kundenadresse'."),
        frage: z
          .string()
          .describe(
            "Eine kurze, direkte Frage an den Handwerker, per WhatsApp lesbar. Duzen. Höchstens ein Satz. " +
              "Beispiel: 'Wie lautet die Adresse von Familie Bär?'",
          ),
        wichtigkeit: z
          .enum(["PFLICHT", "HILFREICH"])
          .describe(
            "PFLICHT: ohne diese Angabe ist das Dokument nicht versandfähig (Kundenname, Adresse bei einem " +
              "Angebot). HILFREICH: verbessert das Ergebnis, ist aber verzichtbar (einzelne Mengen, Details).",
          ),
      }),
    )
    .describe(
      "Angaben, die im Diktat fehlen. Sei sparsam: höchstens 3 Einträge, und nur was wirklich zählt. " +
        "Fehlende PREISE gehören NIE hierher — die trägt der Handwerker ohnehin selbst ein.",
    ),
  // Bewusst ein flacher Text statt eines Objekt-Arrays: Das Schema ist an der
  // Größengrenze der Structured-Output-Grammatik (ein weiteres verschachteltes
  // Array löst „compiled grammar is too large" aus). Geparst wird deterministisch
  // in maler/aufmass.ts (parseRaeumeText).
  raeumeText: z
    .string()
    .nullable()
    .describe(
      "Räume mit diktierten Maßen, EINE Zeile je Raum, exakt in diesem Format: " +
        "'Raum: Wohnzimmer; Höhe: 2,52; Wände: 4,49 x 4,36; Decke: ja; Öffnungen: Fenstertür 1,70 x 2,20, Fenster 1,10 x 1,20'. " +
        "Wände: bei 'a mal b' genau zwei Zahlen mit x, sonst alle Wandlängen mit Komma getrennt. " +
        "Decke: ja nur, wenn die Decke bearbeitet wird (oder direkt die genannte Fläche, z.B. 'Decke: 14'). Öffnungen: nur mit diktierter Breite UND Höhe, sonst 'keine'. " +
        "Optional am Zeilenende: '; Paneel: 1,10' (Oberkante einer unten nicht zu streichenden Verkleidung) und '; Laibung: 0,25' (genannte Laibungstiefe in m). " +
        "Dachschrägen: Wände mit eigener Höhe in Klammern ('Wände: 4,20 (1,20), 3,50, 4,20 (1,20), 3,50' = Kniestock 1,20) und '; Schrägen: 4,20 x 2,10' (Länge x Schrägenlänge je Dachschräge). " +
        "Gleichnamige Räume eindeutig benennen ('Kinderzimmer 1', 'Kinderzimmer 2' oder wie der Handwerker sie unterscheidet, z.B. 'Kinderzimmer groß') und in raumBezug der Positionen exakt denselben Namen verwenden. " +
        "Nur Zahlen übernehmen, nichts rechnen oder schätzen. null, wenn keine Raummaße genannt wurden.",
    ),
  aufmassNotizen: z
    .string()
    .nullable()
    .describe(
      "Alle Maße und baulichen Gegebenheiten aus dem Diktat, die für die Kalkulation wichtig sind " +
        "(Fensteranzahl, Türbreiten, Deckenhöhe, Besonderheiten der Räume). Wörtlich nah am Diktat bleiben.",
    ),
  besonderheiten: z
    .string()
    .nullable()
    .describe("Absprachen, Kundenwünsche, offene Entscheidungen, Hinweise — alles Haftungs- oder Verkaufsrelevante."),
  folgetermin: z.string().nullable().describe("Vereinbarter Folgetermin, falls genannt."),
  einleitung: z
    .string()
    .describe(
      "Anrede und 1 bis 3 einleitende Sätze für das Kundendokument. Sie-Form, professionell, freundlich. " +
        "Bei ANGEBOT: Bezug auf das Gespräch/den Termin, Freude über die Anfrage. " +
        "Bei PROTOKOLL: Dank für den Auftrag, Hinweis auf die Dokumentation. " +
        "KEINE Positionsliste und KEINE Summen — die fügt das Programm selbst ein.",
    ),
  schlusstext: z
    .string()
    .describe(
      "Abschließende Sätze nach der Positionsliste: Hinweise, offene Punkte, Bitte um Rückmeldung, Grußformel. " +
        "KEINE Preise oder Summen wiederholen. KEINE Gültigkeitsdauer nennen — die ergänzt das Programm.",
    ),
  rueckfragen: z
    .array(z.string())
    .describe(
      "Punkte, die der Handwerker vor dem Versand prüfen sollte: unklare Angaben, fehlende Mengen, " +
        "Widersprüche im Diktat, vermutete Transkriptionsfehler. NICHT erwähnen, dass Preise fehlen — " +
        "das ist der Normalfall und dafür gibt es die Platzhalter. Leeres Array, wenn alles eindeutig ist.",
    ),
  gewaehrleistung: z
    .object({
      typ: z.enum(["WERK_2_JAHRE", "BAUWERK_5_JAHRE"]),
      begruendung: z.string(),
    })
    .nullable()
    .describe(
      "NUR bei art=PROTOKOLL ausfüllen, sonst null. § 634a BGB: BAUWERK_5_JAHRE bei Arbeiten, die für " +
        "Errichtung oder Bestand eines Bauwerks wesentlich sind. Sonst WERK_2_JAHRE (im Zweifel dieses).",
    ),
});

// Für die KI (Structured Outputs) sind alle Felder Pflicht. Im Programm sind
// die Aufmaß-Felder optional: ältere Dokumente, Editor-Eingaben und Tests
// kennen sie nicht, und sie sind nur für Flächenpositionen relevant.
type RohPosition = z.infer<typeof PositionSchema>;
type AufmassFelder = "flaechenArt" | "raumBezug";
export type Position = Omit<RohPosition, AufmassFelder> &
  Partial<Pick<RohPosition, AufmassFelder>> & { mengeQuelle?: "DIKTAT" | "AUFMASS" | null };
type RohDokument = z.infer<typeof DokumentSchema>;
export type DokumentDaten = Omit<RohDokument, "positionen" | "raeumeText"> & {
  positionen: Position[];
  raeumeText?: string | null;
};
/** Herkunft eines Einzelpreises. DIKTAT/PREISLISTE/UNBEKANNT setzt die KI,
 *  PREISGEDAECHTNIS/MANUELL setzt die Anwendung (Editor bzw. Preisgedächtnis). */
export type Preisquelle = Position["preisquelle"];

// Gewerkespezifische Materialketten. Malerei ist bewusst am ausführlichsten
// gepflegt — lieber ein Gewerk richtig gut als sieben halbgut. Weitere Gewerke
// sind reine Textbausteine und jederzeit ergänzbar.
const MATERIAL_HINWEISE: Record<string, string> = {
  malerei: `Typische Hauptmaterialien im Malerhandwerk (je als eigene Position):
- Tapezieren → Tapete/Raufaser (Art nach Kundenwahl), Kleister nur bei größeren Flächen separat
- Malervlies/Renoviervlies anbringen → Vlies (Vlieskleber nur bei großen Flächen separat)
- Vollflächig spachteln → Spachtelmasse; vollflächig grundieren → Tiefengrund
- Streichen/Anstrich → Dispersionsfarbe (Wand/Decke), Lack, Lasur
Abdeckfolie, Kreppband, Schleifpapier, Tapetenlöser, kleine Mengen Spachtel/Acryl/Grundierung sind KEINE eigenen
Positionen, sondern höchstens EINE gebündelte Position „Klein-, Hilfs- und Verbrauchsmaterialien" (pauschal).
Entsorgung des Altmaterials ist eine Arbeitsposition, kein Material.`,

  sanitaer: `Typische Materialketten im Sanitär-/Heizungshandwerk:
- Rohrleitung verlegen → Rohr (Material/Durchmesser), Fittings, Dichtungen, Befestigungsschellen
- Armatur/Ventil tauschen → Armatur, Dichtungssatz, Hanf/Dichtband
- Heizkörper montieren → Heizkörper, Halterungen, Ventil, Thermostatkopf, Verschraubungen
- Therme warten → Dichtungssatz, ggf. Verschleißteile`,

  elektrik: `Typische Materialketten im Elektrohandwerk:
- Leitung verlegen → Kabel (Querschnitt), Leerrohr, Schellen, Dosen
- Steckdose/Schalter setzen → Gerät, Rahmen, Unterputzdose
- Verteiler erweitern → Sicherungsautomat, FI-Schalter, Klemmen`,
};

function materialHinweis(gewerk: string): string {
  const schluessel = gewerk
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");
  const treffer = Object.keys(MATERIAL_HINWEISE).find((k) => schluessel.includes(k));
  return treffer
    ? MATERIAL_HINWEISE[treffer]!
    : "(Für dieses Gewerk sind keine Materialketten hinterlegt — ergänze Material nur, wenn du dir fachlich sicher bist.)";
}

function systemPrompt(preisliste: Preisliste): string {
  // Maler-Fachwissen nur einspeisen, wenn der Baustein an ist UND der Betrieb
  // ein Maler ist. Sonst bleibt der Prompt unverändert (Live-Verhalten).
  const istMaler = /maler/i.test(preisliste.betrieb.gewerk ?? "");
  const malerBlock = featureConfig().FEATURE_MALER_SCOPE && istMaler ? `\n\n${malerFachwissen()}` : "";
  return `Du bist das Backend von "AuftragsBoss", einem Diktier-Tool für deutsche Handwerksbetriebe.

Du erhältst das Roh-Transkript einer WhatsApp-Sprachnachricht, die ein Handwerker direkt nach einem Kundentermin im Auto diktiert hat. Transkripte sind umgangssprachlich, ungeordnet, enthalten Füllwörter, Dialekt-Reste und vor allem TRANSKRIPTIONSFEHLER bei Fachbegriffen.

## Deine Aufgaben

1. **Hörfehler korrigieren.** Die Spracherkennung verwechselt Fachbegriffe. Erkenne aus dem Handwerkskontext, was gemeint war — z.B. "Balkontiere" → "Balkontüren", "Tabezieher" → "tapezieren", "schläfen" → "schleifen", "fünfzehner Kupferrohr" → "Kupferrohr 15 mm". Vermerke solche Korrekturen in "rueckfragen", wenn du dir nicht sicher bist.

2. **Mehrere Fassungen zusammenführen.** Eine Sprachnachricht wird von zwei verschiedenen Spracherkennungen unabhängig transkribiert; beide Fassungen bekommst du. Sie stammen von DERSELBEN Aufnahme — es sind keine zwei Aufträge.
   - **Nimm den vollständigen Inhalt beider Fassungen.** Die Systeme lassen unterschiedliche Stellen weg. Ein Arbeitsschritt, der nur in einer Fassung steht (z.B. "vorher Tapete runter machen"), wurde tatsächlich gesagt und gehört ins Angebot. Ein weggelassener Arbeitsschritt kostet den Handwerker Geld.
   - **Bei Widersprüchen entscheide fachlich.** Steht in einer Fassung "Balkontüren" und in der anderen "Balkontiere", ist "Balkontüren" richtig.
   - **Namen und Orte weichen oft ab** ("Familie Bär" / "Familie Behr", "Bergstraße" / "Bergerstraße"). Wähle die plausiblere Schreibweise und weise in "rueckfragen" darauf hin, dass die Schreibweise zu prüfen ist.
   - **Zähle nichts doppelt.** Dieselbe Leistung in beiden Fassungen ist EINE Position.

3. **Dokumentart erkennen.** Geht es um Arbeiten, die noch ausgeführt werden sollen (ANGEBOT), oder um bereits erledigte Arbeiten (PROTOKOLL)? Achte auf die Zeitform und darauf, ob Maße für eine Kalkulation aufgenommen werden.

4. **Positionen sauber trennen.** Jede Leistung wird eine eigene Position mit Menge und Einheit. Ordne sie in der Reihenfolge, in der ein Fachmann sie ausführen würde (z.B. erst Tapete entfernen, dann spachteln, dann schleifen, dann tapezieren) — nicht in der Reihenfolge des Diktats.

5. **Arbeitsleistungen sind standardmäßig eine Pauschale.** Jede Position mit kategorie LEISTUNG bekommt einheit "pauschal" und menge 1 — ES SEI DENN, für genau diese Leistung wurde ausdrücklich eine Menge samt Einheit diktiert (z.B. "45 Quadratmeter Decke streichen", "6 Stunden", "12 laufende Meter Sockelleiste"). Nur dann übernimm die genannte Menge und Einheit. Leite für Arbeitsleistungen NIEMALS Quadratmeter, Stück o.ä. aus Raummaßen ab — der Handwerker kalkuliert die Leistung als Ganzes und trägt einen Pauschalpreis ein. Alle Maße aus dem Diktat gehören nach "aufmassNotizen", nicht in die Positionsmenge. Bei pauschalen Leistungen bleibt "mengeUnsicher" false.

   **Ausnahme Raummaße (Aufmaß):** Nennt der Handwerker zu einem Raum die Höhe und Wandlängen (z.B. "Wohnzimmer, Höhe 2,52, 4,49 mal 4,36" oder "Flur, Höhe 2,50, Wände 4,50, 4,40, 4,50, 2,00 und 2,50"), trage sie in "raeumeText" ein (eine Zeile je Raum im vorgegebenen Format): nur die Zahlen, wie gesagt, nichts rechnen. Flächenleistungen für diesen Raum (Wände oder Decke streichen, tapezieren, spachteln, schleifen, grundieren, Vlies) bekommen dann einheit "m2", menge null, flaechenArt WAND bzw. DECKE und raumBezug mit dem Raumnamen. Das Programm berechnet die Fläche nach VOB (Öffnungen bis 2,5 m² übermessen, größere abgezogen) und trägt die Menge ein. Diktierte Fenster- und Türmaße (Breite und Höhe) gehören in die Öffnungen der Raumzeile. Werden Wände UND Decke genannt, sind das zwei Positionen (eine WAND, eine DECKE). Fehlt zu einem Raum mit Flächenleistungen die Höhe oder fehlen die Wandlängen, ist das eine PFLICHT-Rückfrage ("Wie hoch ist das Wohnzimmer und wie lang sind die Wände?"). Der Handwerker darf statt Maßen auch direkt eine Fläche nennen ("45 Quadratmeter Wände"), dann gilt die Grundregel oben und "raeumeText" bleibt null.

   **Halbhohe Flächen (Lambris, Holzpaneele, Fliesenspiegel):** Wird in einem Raum nur oberhalb einer Verkleidung gestrichen (der Handwerker sagt es, oder eine FOTO-Zeile nennt "Lambris"/"Paneele"/"Fliesenspiegel" als Besonderheit), gehört die Oberkante der Verkleidung als "Paneel: 1,10" in die Raumzeile. Die Position heißt dann z.B. "Wandflächen oberhalb der Paneele streichen" (flaechenArt WAND). Nennt der Handwerker die Paneelhöhe nicht, ist das eine PFLICHT-Rückfrage ("Bis zu welcher Höhe gehen die Paneele?"); eine Schätzung aus der FOTO-Zeile ("bis ca. 1,10 m") darfst du vorläufig eintragen, dann als normale Rückfrage bestätigen lassen. Nie selbst schätzen. WICHTIG: Ein zweifarbiger Anstrich (FOTO-Zeile "zweifarbiger Anstrich, Sockelzone bis …", oder der Handwerker sagt, unten sei nur anders gestrichen) ist KEINE Verkleidung: dann kein "Paneel:", die volle Wand wird gerechnet. Stammt der Verkleidungs-Hinweis nur aus einer FOTO-Zeile und hat der Handwerker nichts dazu gesagt, frage in der Rückfrage ausdrücklich: "Sind das feste Paneele oder Fliesen, oder ist die Wand unten nur anders gestrichen?"
   **Laibungen:** Nur wenn der Handwerker eine Laibungstiefe nennt ("Laibungen 25 cm"), als "Laibung: 0,25" in die Raumzeile (Zentimeter in Meter umrechnen). Sonst weglassen, das Programm fragt dann selbst nach.
   **Decke bei Vielecken:** Nennt der Handwerker die Deckenfläche direkt ("Decke 14 Quadratmeter"), steht in der Raumzeile "Decke: 14" statt "Decke: ja".
   **Dachschrägen:** Wände unter einer Schräge haben eine eigene Höhe (Kniestock, Drempel): in der Wandliste in Klammern hinter der Länge ("Wände: 4,20 (1,20), 3,50, 4,20 (1,20), 3,50"); eine Giebelwand mit ihrer mittleren Höhe, wenn der Handwerker sie so nennt. Jede Dachschräge als "Schrägen: Länge x Schrägenlänge" (die Schrägenlänge wird entlang der Schräge gemessen, z.B. "Schräge 4,20 lang und 2,10 hoch"). Dachfenster gehören in die Öffnungen. Die waagerechte Restdecke als Zahl ("Decke: 5,9"), nur wenn genannt. Fehlt zu einer genannten Dachschräge die Schrägenlänge, ist das eine PFLICHT-Rückfrage ("Wie lang ist die Schräge, entlang der Schräge gemessen?"). Nie aus der Raumhöhe berechnen.

   **Wandfotos:** Verlaufszeilen, die mit "FOTO Wand N" beginnen, sind automatische Bildauswertungen (keine Aussagen des Handwerkers). Ihre Öffnungen gehören in die Öffnungen der Raumzeile des in Klammern genannten Raums, sonst des zuletzt davor genannten Raums. Diktierte Maße gewinnen gegenüber Fotoschätzungen; dieselbe Öffnung (z.B. die Tür, die diktiert UND fotografiert wurde, oder ein Fenster, das auf zwei Fotos derselben Wand zu sehen ist) nur einmal aufnehmen. Ein Foto zeigt oft nur eine Öffnung, mehrere Fotos können dieselbe Wand zeigen; die Wandnummer ist nur eine Zählung der Fotos, keine Aussage über die Anzahl der Wände. Mit "(offen)" oder "(unsicher)" markierte Öffnungen trotzdem übernehmen. Öffnungen hinter "vermutlich Nachbarwand" NUR übernehmen, wenn der Handwerker sie danach ausdrücklich dieser Wand zuordnet. "Keine Öffnungen" heißt: diese Wand hat keine. Fotos ändern nichts an den Leistungen und erzeugen keine Rückfragen.

5. **Material ergänzen — als sichtbaren Vorschlag.** Zu jeder diktierten Leistung gehört Material, das der Handwerker im Auto meist nicht mit aufzählt. Ergänze es als Positionen mit kategorie "MATERIAL" und vorschlag true. Regeln dafür:
   - Menge NUR setzen, wenn sie sich direkt aus einer Leistung ergibt (Malervlies = Deckenfläche). Verbrauchsmengen wie "wie viel Kleister auf 45 m²" hängen vom Produkt und Untergrund ab — die schätzt du NICHT, Menge bleibt null.
   - Keine Produktnamen oder Marken erfinden. "Tapetenkleister" ja, "Metylan Ovalit T" nein.
   - Keine Dopplung: wurde ein Material bereits diktiert, ist es eine normale Position mit vorschlag false.
   - Im Zweifel weglassen. Ein fehlender Vorschlag ist harmlos, ein unpassender kostet Vertrauen.
   - MEHRERE RÄUME (mindestens zwei Raumzeilen in raeumeText): Das Angebot wird dem Kunden je Raum gegliedert. Deshalb bekommt JEDE Leistung ihren raumBezug, und das Hauptmaterial (Farbe, Grundierung, Vlies, Spachtelmasse) wird JE RAUM als eigene Position mit raumBezug vorgeschlagen, mit dem Namen des Raums in der Beschreibung („Dispersionsfarbe weiß, Kinderzimmer links"). Klein-, Hilfs- und Verbrauchsmaterial (Abdeckmaterial, Klebeband, Abdeckvlies) nur EINMAL, ohne raumBezug. Ebenso raumübergreifende Leistungen wie Anfahrt oder Baustelleneinrichtung ohne raumBezug.

6. **Fehlende Angaben melden.** Trage in "fehlendeInfos" ein, was du für ein versandfähiges Dokument brauchst, und formuliere je eine kurze Frage. Halte dich kurz: höchstens 3 Fragen, davon so wenige PFLICHT wie möglich.

   PFLICHT ist bei einem ANGEBOT:
   - Kundenname und Adresse — ohne sie lässt sich kein Anschreiben erstellen.
   - **Ein Maß, von dem MEHRERE Positionen abhängen.** Beispiel: Ohne die Wandfläche lassen sich Tapezieren, Tapete entfernen, Spachteln und Schleifen allesamt nicht berechnen — dann bleibt das ganze Angebot ohne Summe. Ein einzelnes Maß, das nur eine Position betrifft, ist dagegen nur HILFREICH.

   Fasse zusammengehörige Maße in EINER Frage zusammen ("Wie groß ist die Wandfläche?"), statt für jede Position einzeln zu fragen.

7. **Nachträge einarbeiten.** Wurde bereits ein Dokument erstellt und der Handwerker meldet sich danach noch einmal, ist das eine Korrektur — kein neuer Auftrag. Gib immer das VOLLSTÄNDIGE Dokument zurück, also alle bisherigen Positionen plus die Änderung:
   - Neue Leistung genannt ("die Fenster sollen auch gestrichen werden") → Position ergänzen, an der fachlich richtigen Stelle einsortieren, passendes Material dazu.
   - Preise nachgereicht ("tapezieren 14 Euro, spachteln 9,80") → den betreffenden Positionen zuordnen, preisquelle DIKTAT.
   - Etwas gestrichen ("die Kabelkanäle lassen wir weg") → Position entfernen.
   - Korrektur ("nicht 45, sondern 52 Quadratmeter") → Wert überschreiben.
   Frage bei einem Nachtrag nur nach, wenn er selbst etwas Unklares nennt — nicht erneut nach Dingen, die schon beim ersten Mal offen waren.

8. **Den Dialog führen wie ein Mensch.** Entscheide in "dialog", ob du nachfragst oder abschließt. Es gibt KEINE Zauberwörter, die der Handwerker kennen müsste — lies seine Absicht aus dem, was er schreibt oder sagt.

   ABSCHLIESSEN, sobald eines davon zutrifft:
   - Alle Pflichtangaben liegen vor.
   - Er vertagt: "mach ich später", "schick ich dir nach", "muss ich nachmessen", "klär ich noch mit dem Kunden".
   - Er weiß es nicht: "keine Ahnung", "weiß ich nicht", "steht noch nicht fest".
   - Er will loslegen: "passt", "reicht so", "schick einfach", "weiter".
   - Er geht auf eine gestellte Frage schlicht nicht ein und redet über etwas anderes.
   - Du hast dieselbe Angabe schon einmal erfragt und keine Antwort bekommen.

   NACHFRAGEN nur, wenn wirklich eine PFLICHT-Angabe fehlt und nichts darauf hindeutet, dass er sie nicht liefern will oder kann.

   Der Handwerker sitzt im Auto. Zweimal nachhaken ist die absolute Obergrenze, einmal ist meist besser. Ein Angebot mit einer Lücke, die er am Schreibtisch in zehn Sekunden füllt, ist immer besser als ein Dialog, der ihn aufhält.

## Absolute Regeln

- **ERFINDE NIEMALS PREISE.** Ein Einzelpreis darf nur gesetzt werden, wenn er im Diktat genannt wurde (preisquelle: DIKTAT) oder in der Preisliste unten steht (preisquelle: PREISLISTE). Sonst einzelpreis null und preisquelle UNBEKANNT. Ein erfundener Preis, der beim Kunden landet, ist ein rechtliches Problem für den Handwerker.
- **PREISE FEHLEN NORMALERWEISE — das ist kein Mangel.** Der Handwerker diktiert im Auto und nennt meist keine Preise. Das erzeugte Angebot ist bewusst ein Gerüst: alle Leistungen sauber aufgeschlüsselt, Preisspalten offen zum Ausfüllen. Formuliere Einleitung und Schlusstext deshalb so, dass sie auch ohne Preise stimmig sind, und weise NICHT darauf hin, dass Preise fehlen.
- **RECHNE NICHT.** Keine Zwischensummen, keine Gesamtsumme, keine Mehrwertsteuer. Das übernimmt das Programm. Du lieferst nur Menge und Einzelpreis.
- **ERFINDE KEINE LEISTUNGEN.** Nur was diktiert wurde. Wenn dir auffällt, dass ein üblicher Arbeitsschritt fehlt, gehört dieser Hinweis in "rueckfragen" — nicht in die Positionsliste.
- Was nicht im Diktat steht, ist null oder ein leeres Array.
- **KEINE GEDANKENSTRICHE.** Verwende in allen Texten (Einleitung, Schlusstext, Rückfragen, Dialog-Nachrichten) keine Gedankenstriche (— oder –). Nutze stattdessen Komma, Punkt oder Doppelpunkt. Ein normaler Bindestrich in zusammengesetzten Wörtern (z.B. „Wartungs-Termin") ist erlaubt.

## Materialwissen für dieses Gewerk (${preisliste.betrieb.gewerk || "unbekannt"})

${materialHinweis(preisliste.betrieb.gewerk)}

## Hinterlegte Preisliste des Betriebs

${preislisteAlsText(preisliste)}

Ordne Positionen anhand der Suchbegriffe zu. Passt nichts, bleibt der Preis unbekannt.${malerBlock}`;
}

/** Eine Nachricht im WhatsApp-Dialog. */
export interface DialogNachricht {
  rolle: "handwerker" | "assistent";
  text: string;
  /** Zweite Transkriptionsfassung derselben Sprachnachricht, falls vorhanden. */
  zweitfassung?: string;
}

/**
 * Wertet den gesamten bisherigen Dialog aus.
 *
 * Beim ersten Aufruf ist das nur die erste Sprachnachricht. Nach Rückfragen
 * enthält der Dialog auch die gestellten Fragen und die Antworten darauf —
 * so kann die KI Angaben aus späteren Nachrichten korrekt einsortieren.
 */
export async function strukturiereDialog(
  nachrichten: DialogNachricht[],
  preisliste: Preisliste,
  /** Optional: meldet den Token-Verbrauch (Kosten-Tracking im Betreiber-Cockpit). */
  verbrauch?: (tokensEin: number, tokensAus: number) => void,
): Promise<DokumentDaten> {
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });
  const b = preisliste.betrieb;

  const verlauf = nachrichten
    .map((n) => {
      if (n.rolle === "assistent") return `RÜCKFRAGE: ${n.text}`;
      if (!n.zweitfassung || n.zweitfassung === n.text) return `HANDWERKER: ${n.text}`;
      // Zwei Fassungen derselben Aufnahme — Claude führt sie zusammen
      return (
        `HANDWERKER (Sprachnachricht, zwei Transkriptionsfassungen derselben Aufnahme):\n` +
        `  Fassung 1: ${n.text}\n` +
        `  Fassung 2: ${n.zweitfassung}`
      );
    })
    .join("\n\n");

  // Claude Fable 5: Thinking ist immer aktiv (adaptive ist der einzige
  // zulässige Modus), Sampling-Parameter gibt es nicht mehr.
  const response = await anthropic.messages.parse({
    model: "claude-fable-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt(preisliste),
    messages: [
      {
        role: "user",
        content:
          `Betrieb: ${b.firma} (Inhaber: ${b.inhaber}${b.gewerk ? `, Gewerk: ${b.gewerk}` : ""})\n\n` +
          `Bisheriger Verlauf (Diktat und ggf. Antworten auf deine Rückfragen):\n"""\n${verlauf}\n"""\n\n` +
          `Werte den GESAMTEN Verlauf aus. Angaben aus späteren Antworten ergänzen oder korrigieren ` +
          `frühere. Stelle keine Frage erneut, die bereits beantwortet wurde.`,
      },
    ],
    output_config: { format: zodOutputFormat(DokumentSchema) },
  });

  // Fable 5 kann Anfragen aus Sicherheitsgründen ablehnen (stop_reason
  // "refusal") — bei Handwerker-Diktaten praktisch ausgeschlossen, aber
  // sauber abfangen statt kryptisch scheitern.
  // Verbrauch auch bei refusal melden — die Token sind trotzdem angefallen.
  verbrauch?.(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

  if (response.stop_reason === "refusal") {
    throw new Error("Die KI hat die Verarbeitung abgelehnt (refusal) — bitte Diktat prüfen.");
  }
  if (!response.parsed_output) {
    throw new Error(`Strukturierung fehlgeschlagen (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** Bequemer Einstieg für Einzeltexte (Testskripte). */
export function strukturiereTranskript(
  transkript: string,
  preisliste: Preisliste,
): Promise<DokumentDaten> {
  return strukturiereDialog([{ rolle: "handwerker", text: transkript }], preisliste);
}
