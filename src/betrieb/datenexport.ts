// Maschinenlesbarer Datenexport eines Betriebs (17.09.2026, Data Act / DSGVO
// Art. 20). Ein ZIP mit allem, was dem Betrieb gehört:
//
//   LIESMICH.txt            was drin ist
//   betrieb.json            Stammdaten und Einstellungen (ohne Zugangs-Tokens)
//   angebote.json           alle Angebote und Protokolle, alle Fassungen, mit Positionen
//   angebote.csv            eine Zeile je Dokument (Excel-tauglich, Semikolon, Komma-Dezimal)
//   positionen.csv          eine Zeile je Position
//   kunden.csv              Endkunden, dedupliziert
//   gewaehrleistung.json    Gewährleistungsfristen der Protokolle
//   pdf/<nummer>.pdf        PDF der jeweils aktuellen Fassung (nur registrierte Betriebe)
//   fotos/<nummer>/…        Wandfotos zum Angebot (Belegfotos)
//
// Reine Zusammenstellung, keine Änderung am Datenbestand. Große Betriebe:
// alles im Speicher, bei einigen hundert Angeboten noch unkritisch.
import type { PrismaClient, Handwerker, Dokument } from "@prisma/client";
import { erzeugeZip, type ZipEintrag } from "./zip.js";
import { dokumentZuDaten } from "../web/dokumentDaten.js";
import { effektivePreisliste } from "./betriebsdaten.js";
import { ladePreisliste } from "../preisliste.js";
import { berechneAngebot } from "../angebot/berechnung.js";
import { erzeugeAngebotPdf } from "../angebot/pdf.js";
import { ladeAufmassAnlage } from "../angebot/aufmassblatt.js";
import { liesFoto } from "./fotoAblage.js";

const BOM = "﻿";

/** Ein CSV-Feld nach deutscher Excel-Konvention (Semikolon, Anführungszeichen bei Bedarf). */
export function csvFeld(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  let s: string;
  if (typeof wert === "number") s = Number.isInteger(wert) ? String(wert) : wert.toFixed(2).replace(".", ",");
  else if (wert instanceof Date) s = wert.toISOString().slice(0, 10);
  else if (typeof wert === "boolean") s = wert ? "ja" : "nein";
  else s = String(wert);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvZeilen(kopf: string[], zeilen: unknown[][]): string {
  return BOM + [kopf, ...zeilen].map((z) => z.map(csvFeld).join(";")).join("\r\n") + "\r\n";
}

function sicherDateiname(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "datei";
}

/** Stammdaten ohne Geheimnisse (Tokens, interne Zähler bleiben draußen). */
export function betriebExport(h: Handwerker): Record<string, unknown> {
  return {
    firma: h.firma,
    name: h.name,
    email: h.email,
    whatsappNummer: h.whatsappNummer,
    gewerk: h.gewerk,
    gewerkTyp: h.gewerkTyp,
    strasse: h.strasse,
    plz: h.plz,
    ort: h.ort,
    telefon: h.telefon,
    ustIdNr: h.ustIdNr,
    bank: h.bank,
    iban: h.iban,
    farbe: h.farbe,
    standardEinleitung: h.standardEinleitung,
    standardSchlusstext: h.standardSchlusstext,
    angebotGueltigTage: h.angebotGueltigTage,
    zahlungsziel: h.zahlungsziel,
    einstellungen: {
      preisGedaechtnisAktiv: h.preisGedaechtnisAktiv,
      zusammenfassungAktiv: h.zusammenfassungAktiv,
      materialGetrennt: h.materialGetrennt,
      zeige35a: h.zeige35a,
      lohnanteilProzent: h.lohnanteilProzent,
      mailStandard: h.mailStandard,
    },
    kontoSeit: h.erstelltAm,
    testKonto: h.istTest,
    agbAkzeptiertAm: h.agbAkzeptiertAm,
    agbVersion: h.agbVersion,
  };
}

/** Ein Dokument als Export-Objekt (alle Felder, die dem Betrieb gehören). */
export function dokumentExport(d: Dokument): Record<string, unknown> {
  return {
    nummer: d.nummer,
    art: d.art,
    fassung: d.version,
    datum: d.datum,
    erstelltAm: d.erstelltAm,
    gueltigBis: d.gueltigBis,
    kunde: { name: d.kundeName, strasse: d.kundeStrasse, plzOrt: d.kundePlzOrt, kundenNummer: d.kundenNummer },
    gewerk: d.gewerk,
    objekt: d.objekt,
    einleitung: d.einleitung,
    schlusstext: d.schlusstext,
    aufmassNotizen: d.aufmassNotizen,
    besonderheiten: d.besonderheiten,
    folgetermin: d.folgetermin,
    positionen: JSON.parse(d.positionenJson),
    rueckfragen: JSON.parse(d.rueckfragenJson),
    netto: d.netto,
    mwstSatz: d.mwstSatz,
    mwstBetrag: d.mwstBetrag,
    brutto: d.brutto,
    positionenOhnePreis: d.anzahlOffen,
    versendetAm: d.versendetAm,
    angenommenAm: d.angenommenAm,
    angenommenVon: d.angenommenVon,
    transkript: d.transkript,
  };
}

export interface ExportErgebnis {
  zip: Buffer;
  dateiname: string;
  anzahlDokumente: number;
  anzahlPdf: number;
  anzahlFotos: number;
}

export async function erstelleDatenexport(prisma: PrismaClient, handwerker: Handwerker): Promise<ExportErgebnis> {
  const jetzt = new Date();
  const dokumente = await prisma.dokument.findMany({ where: { handwerkerId: handwerker.id }, orderBy: [{ nummer: "asc" }, { version: "asc" }] });
  const gewaehr = await prisma.gewaehrleistung.findMany({ where: { dokument: { handwerkerId: handwerker.id } }, include: { dokument: { select: { nummer: true, version: true } } } });
  const fotos = await prisma.foto.findMany({ where: { handwerkerId: handwerker.id, dokumentId: { not: null } } });

  const eintraege: ZipEintrag[] = [];

  // Stammdaten
  eintraege.push({ pfad: "betrieb.json", inhalt: JSON.stringify(betriebExport(handwerker), null, 2), zeit: jetzt });

  // Dokumente als JSON
  eintraege.push({ pfad: "angebote.json", inhalt: JSON.stringify(dokumente.map(dokumentExport), null, 2), zeit: jetzt });

  // Dokumente als CSV
  eintraege.push({
    pfad: "angebote.csv",
    inhalt: csvZeilen(
      ["Nummer", "Art", "Fassung", "Datum", "Kunde", "Strasse", "PLZ Ort", "Kundennummer", "Objekt", "Netto", "MwSt", "Brutto", "Positionen ohne Preis", "Versendet am", "Angenommen am"],
      dokumente.map((d) => [d.nummer, d.art, d.version, d.datum, d.kundeName, d.kundeStrasse, d.kundePlzOrt, d.kundenNummer, d.objekt, d.netto, d.mwstBetrag, d.brutto, d.anzahlOffen, d.versendetAm, d.angenommenAm]),
    ),
    zeit: jetzt,
  });

  // Positionen als CSV
  const posZeilen: unknown[][] = [];
  for (const d of dokumente) {
    const positionen = JSON.parse(d.positionenJson) as Array<{ kategorie?: string; beschreibung?: string; menge?: number | null; einheit?: string | null; einzelpreis?: number | null }>;
    positionen.forEach((p, i) => {
      const gesamt = p.menge != null && p.einzelpreis != null ? Math.round(p.menge * p.einzelpreis * 100) / 100 : null;
      posZeilen.push([d.nummer, d.version, i + 1, p.kategorie ?? "", p.beschreibung ?? "", p.menge ?? null, p.einheit ?? "", p.einzelpreis ?? null, gesamt]);
    });
  }
  eintraege.push({
    pfad: "positionen.csv",
    inhalt: csvZeilen(["Nummer", "Fassung", "Pos", "Kategorie", "Beschreibung", "Menge", "Einheit", "Einzelpreis netto", "Gesamt netto"], posZeilen),
    zeit: jetzt,
  });

  // Endkunden, dedupliziert über Name + Anschrift
  const kunden = new Map<string, unknown[]>();
  for (const d of dokumente) {
    const schl = `${d.kundeName ?? ""}|${d.kundeStrasse ?? ""}|${d.kundePlzOrt ?? ""}`;
    if (!d.kundeName && !d.kundeStrasse) continue;
    const alt = kunden.get(schl);
    if (alt) alt[4] = (alt[4] as number) + 1;
    else kunden.set(schl, [d.kundeName, d.kundeStrasse, d.kundePlzOrt, d.kundenNummer, 1]);
  }
  eintraege.push({ pfad: "kunden.csv", inhalt: csvZeilen(["Name", "Strasse", "PLZ Ort", "Kundennummer", "Dokumente"], [...kunden.values()]), zeit: jetzt });

  // Gewährleistung
  eintraege.push({
    pfad: "gewaehrleistung.json",
    inhalt: JSON.stringify(gewaehr.map((g) => ({ nummer: g.dokument.nummer, fassung: g.dokument.version, typ: g.typ, beginn: g.beginn, ablauf: g.ablauf })), null, 2),
    zeit: jetzt,
  });

  // PDFs der jeweils aktuellen Fassung (Test-Konten: kein Download, wie im Editor)
  let anzahlPdf = 0;
  if (!handwerker.istTest) {
    const aktuell = new Map<string, Dokument>();
    for (const d of dokumente) {
      const bisher = aktuell.get(d.nummer);
      if (!bisher || d.version > bisher.version) aktuell.set(d.nummer, d);
    }
    const preisliste = effektivePreisliste(handwerker, ladePreisliste());
    for (const d of aktuell.values()) {
      try {
        const daten = dokumentZuDaten(d);
        const summe = berechneAngebot(daten.positionen, preisliste, d.datum);
        const pdf = await erzeugeAngebotPdf({ daten, summe, preisliste, nummer: d.nummer, datum: d.datum, kundenNummer: d.kundenNummer, aufmass: await ladeAufmassAnlage(prisma, d) });
        eintraege.push({ pfad: `pdf/${sicherDateiname(d.nummer)}.pdf`, inhalt: pdf, zeit: d.erstelltAm });
        anzahlPdf++;
      } catch (err) {
        eintraege.push({ pfad: `pdf/${sicherDateiname(d.nummer)}_FEHLER.txt`, inhalt: `PDF konnte nicht erzeugt werden: ${err instanceof Error ? err.message : String(err)}`, zeit: jetzt });
      }
    }
  }

  // Wandfotos je Dokument
  let anzahlFotos = 0;
  const nummerVonDok = new Map(dokumente.map((d) => [d.id, d.nummer]));
  for (const f of fotos) {
    const inhalt = liesFoto(f.datei);
    if (!inhalt) continue;
    const nummer = nummerVonDok.get(f.dokumentId ?? "") ?? "ohne_angebot";
    const endung = f.mimeType.includes("png") ? "png" : "jpg";
    eintraege.push({ pfad: `fotos/${sicherDateiname(nummer)}/${sicherDateiname((f.raum ?? "raum") + "_wand" + f.wandNr)}_${f.id.slice(-6)}.${endung}`, inhalt, zeit: f.erstelltAm });
    anzahlFotos++;
  }

  const liesmich =
    `AuftragsBoss Datenexport\n` +
    `Betrieb: ${handwerker.firma || handwerker.name}\n` +
    `Erstellt: ${jetzt.toISOString()}\n\n` +
    `betrieb.json          Stammdaten und Einstellungen\n` +
    `angebote.json         ${dokumente.length} Dokument(e), alle Fassungen, mit Positionen und Diktat-Text\n` +
    `angebote.csv          eine Zeile je Dokument (Excel: Daten > Aus Text, UTF-8, Trennzeichen Semikolon)\n` +
    `positionen.csv        eine Zeile je Position\n` +
    `kunden.csv            Endkunden ohne Doppelte\n` +
    `gewaehrleistung.json  Gewaehrleistungsfristen der Protokolle\n` +
    `pdf/                  ${anzahlPdf} PDF(s) der jeweils aktuellen Fassung${handwerker.istTest ? " (im kostenlosen Test nicht enthalten)" : ""}\n` +
    `fotos/                ${anzahlFotos} Wandfoto(s) zu den Angeboten\n\n` +
    `Die Daten gehoeren dir. Fragen: kontakt@auftragsboss.de\n`;
  eintraege.unshift({ pfad: "LIESMICH.txt", inhalt: liesmich, zeit: jetzt });

  const datum = jetzt.toISOString().slice(0, 10);
  return {
    zip: erzeugeZip(eintraege),
    dateiname: `AuftragsBoss_Export_${sicherDateiname(handwerker.firma || handwerker.name || "Betrieb")}_${datum}.zip`,
    anzahlDokumente: dokumente.length,
    anzahlPdf,
    anzahlFotos,
  };
}
