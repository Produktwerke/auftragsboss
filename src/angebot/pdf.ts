// Erzeugt das Angebot als PDF — für den direkten Versand an den Kunden und
// für die Auftragsbestätigung nach der Annahme.
//
// Serverseitig mit pdfkit (kein Chromium, kein externer Renderer), Layout
// bewusst nah an der Word-Datei: gleicher Briefkopf, gleiche Positionstabelle,
// gleiche getrennten Zwischensummen. So sehen beide Exportwege gleich aus.
import PDFDocument from "pdfkit";
import type { DokumentDaten } from "../ai/structure.js";
import type { Angebotssumme, BerechnetePosition } from "./berechnung.js";
import { euro, mengeMitEinheit } from "./berechnung.js";
import type { Preisliste } from "../preisliste.js";
import { ladeLogo } from "../betrieb/logo.js";

const datumDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

export interface PdfOptionen {
  daten: DokumentDaten;
  summe: Angebotssumme;
  preisliste: Preisliste;
  nummer: string;
  datum: Date;
  kundenNummer?: string | null;
  /** Optionaler Annahme-Vermerk für die Auftragsbestätigung. */
  annahme?: { am: Date; von: string };
}

export function erzeugeAngebotPdf(opts: PdfOptionen): Promise<Buffer> {
  const { daten, summe, preisliste, nummer, datum, kundenNummer, annahme } = opts;
  const b = preisliste.betrieb;
  const akzent = `#${/^[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe : "0B5CAD"}`;
  const grau = "#666666";
  const logo = ladeLogo(b.logo);
  const istAngebot = daten.art === "ANGEBOT";
  const titel = annahme ? "Auftragsbestätigung" : istAngebot ? "Angebot" : "Arbeitsprotokoll";

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fertig = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = 50; // linker Rand
  const R = 545; // rechter Rand
  const breite = R - L;

  // ── Briefkopf ─────────────────────────────────────────
  if (logo) {
    try {
      // Das Logo muss KOMPLETT über der Trennlinie (y=92) bleiben. Höhe so
      // begrenzen, dass es zwischen Seitenrand (y=46) und Linie passt, und
      // die Breite proportional mitführen — sonst wird es verzerrt und die
      // rechtsbündige Position stimmt nicht (Ursache der Überlappung im PDF).
      const maxHoehe = 40;
      const h = Math.min(logo.hoehe, maxHoehe);
      const w = logo.breite * (h / logo.hoehe);
      doc.image(logo.daten, R - w, 46, { width: w, height: h });
    } catch {
      // Logo unlesbar — dann eben ohne
    }
  }
  doc.fillColor(akzent).font("Helvetica-Bold").fontSize(17).text(b.firma, L, 50);
  doc
    .fillColor(grau)
    .font("Helvetica")
    .fontSize(8.5)
    .text([b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon, b.email].filter(Boolean).join("  ·  "), L, 74);
  doc
    .moveTo(L, 92)
    .lineTo(R, 92)
    .strokeColor(akzent)
    .lineWidth(1.5)
    .stroke();

  // ── Empfänger + Titel ─────────────────────────────────
  let y = 112;
  doc.fillColor("#1a1a1a").font("Helvetica-Bold").fontSize(11);
  if (daten.kunde.name) doc.text(daten.kunde.name, L, y), (y += 15);
  doc.font("Helvetica").fontSize(10);
  for (const adressZeile of [daten.kunde.strasse, daten.kunde.plzOrt]) {
    if (adressZeile) doc.text(adressZeile, L, y), (y += 14);
  }

  y += 14;
  doc.fillColor("#1a1a1a").font("Helvetica-Bold").fontSize(16).text(`${titel} ${nummer}`, L, y);
  y += 22;
  doc
    .fillColor(grau)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Datum: ${datumDE(datum)}` +
        (kundenNummer ? `   ·   Kundennummer: ${kundenNummer}` : "") +
        (daten.objekt ? `   ·   Objekt: ${daten.objekt}` : ""),
      L,
      y,
    );
  y += 22;

  // ── Annahme-Vermerk (nur Auftragsbestätigung) ─────────
  if (annahme) {
    doc.rect(L, y, breite, 44).fill("#eef7ee");
    doc
      .fillColor("#2e7d32")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`✓ Vom Kunden angenommen`, L + 12, y + 9);
    doc
      .fillColor("#1a1a1a")
      .font("Helvetica")
      .fontSize(9)
      .text(`${annahme.von} · ${annahme.am.toLocaleString("de-DE")}`, L + 12, y + 24);
    y += 58;
  }

  // ── Anschreiben ───────────────────────────────────────
  doc.fillColor("#1a1a1a").font("Helvetica").fontSize(10);
  doc.text(daten.einleitung, L, y, { width: breite, align: "left" });
  y = doc.y + 16;

  // ── Positionstabelle ──────────────────────────────────
  const spalten = { pos: L, leist: L + 28, menge: 330, preis: 400, gesamt: 475 };
  const zeichneKopf = (yk: number) => {
    doc.rect(L, yk, breite, 20).fill(akzent);
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8.5);
    doc.text("Pos.", spalten.pos + 4, yk + 6);
    doc.text("Leistung", spalten.leist, yk + 6);
    doc.text("Menge", spalten.menge, yk + 6, { width: 60, align: "right" });
    doc.text("Einzelpreis", spalten.preis, yk + 6, { width: 68, align: "right" });
    doc.text("Gesamt", spalten.gesamt, yk + 6, { width: 66, align: "right" });
    return yk + 20;
  };

  const seitenumbruch = (yc: number): number => {
    if (yc > 720) {
      doc.addPage();
      return zeichneKopf(50);
    }
    return yc;
  };

  y = zeichneKopf(y);

  const zeichneAbschnitt = (label: string, yc: number): number => {
    yc = seitenumbruch(yc);
    doc.rect(L, yc, breite, 16).fill("#f2f5f8");
    doc.fillColor("#555").font("Helvetica-Bold").fontSize(8.5).text(label, spalten.leist, yc + 5);
    return yc + 16;
  };

  const zeichneZeile = (p: BerechnetePosition, yc: number): number => {
    yc = seitenumbruch(yc);
    const menge =
      p.menge !== null || p.einheit === "pauschal" ? mengeMitEinheit(p.menge, p.einheit) : "";
    const preis = p.einzelpreis !== null ? euro(p.einzelpreis) : "";
    const gesamt = p.gesamt !== null ? euro(p.gesamt) : "";
    doc.fillColor("#1a1a1a").font("Helvetica").fontSize(9);
    doc.text(String(p.nummer), spalten.pos + 2, yc + 5, { width: 22 });
    const hoehe = doc.heightOfString(p.beschreibung, { width: spalten.menge - spalten.leist - 8 });
    doc.text(p.beschreibung, spalten.leist, yc + 5, { width: spalten.menge - spalten.leist - 8 });
    doc.text(menge, spalten.menge, yc + 5, { width: 60, align: "right" });
    doc.text(preis || "___", spalten.preis, yc + 5, { width: 68, align: "right" });
    doc.font("Helvetica-Bold").text(gesamt || "___", spalten.gesamt, yc + 5, { width: 66, align: "right" });
    const zeilenhoehe = Math.max(hoehe + 10, 20);
    doc.moveTo(L, yc + zeilenhoehe).lineTo(R, yc + zeilenhoehe).strokeColor("#eceff2").lineWidth(0.5).stroke();
    return yc + zeilenhoehe;
  };

  // Jede Kategorie als eigener Block — bei nur einem Block ohne Überschrift
  // und Zwischensumme.
  const mehrereBloecke = summe.bloecke.length > 1;
  for (const block of summe.bloecke) {
    if (mehrereBloecke) y = zeichneAbschnitt(block.name, y);
    for (const p of block.positionen) y = zeichneZeile(p, y);
    if (mehrereBloecke) y = zeichneZwischensumme(`Zwischensumme ${block.name}`, block, y);
  }

  function zeichneZwischensumme(label: string, teil: Angebotssumme["leistungen"], yc: number): number {
    yc = seitenumbruch(yc);
    doc.fillColor(grau).font("Helvetica-Bold").fontSize(9);
    doc.text(label, spalten.leist, yc + 4, { width: spalten.gesamt - spalten.leist - 8, align: "right" });
    doc.text(teil.vollstaendig ? euro(teil.netto) : "", spalten.gesamt, yc + 4, { width: 66, align: "right" });
    return yc + 18;
  }

  // ── Summenblock ───────────────────────────────────────
  y = seitenumbruch(y) + 6;
  const summenZeile = (label: string, wert: string, fett = false, farbe = "#1a1a1a") => {
    doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(fett ? 12 : 10).fillColor(farbe);
    doc.text(label, 300, y, { width: 130, align: "right" });
    doc.text(wert, spalten.gesamt - 20, y, { width: 86, align: "right" });
    y += fett ? 22 : 16;
  };
  const w = (n: number) => (summe.vollstaendig ? euro(n) : "___ €");
  summenZeile("Nettosumme", w(summe.netto));
  summenZeile(`zzgl. ${summe.mwstSatz} % MwSt.`, w(summe.mwstBetrag), false, grau);
  doc.moveTo(300, y).lineTo(R, y).strokeColor(akzent).lineWidth(1).stroke();
  y += 6;
  summenZeile("Gesamtbetrag", w(summe.brutto), true, akzent);

  // ── Schlusstext ───────────────────────────────────────
  // Passt der Schlusstext nicht mehr komplett auf die Seite, lieber ganz auf
  // die nächste — sonst steht die Grußformel verwaist über dem Seitenumbruch.
  y += 10;
  doc.font("Helvetica").fontSize(10);
  const schlussHoehe = doc.heightOfString(daten.schlusstext, { width: breite });
  if (y + schlussHoehe > 760) {
    doc.addPage();
    y = 50;
  }
  doc.fillColor("#1a1a1a").text(daten.schlusstext, L, y, { width: breite });

  if (istAngebot && !annahme) {
    doc.moveDown(0.8);
    doc
      .fillColor(grau)
      .fontSize(8.5)
      .text(
        `Dieses Angebot ist gültig bis ${datumDE(summe.gueltigBis)}. Zahlungsziel: ${preisliste.konditionen.zahlungsziel}.`,
        { width: breite },
      );
  }

  // Fußzeile in zwei Zeilen (wie im Word), damit beide Formate gleich aussehen:
  //   1) Firma, Anschrift, Ansprechpartner   2) USt-IdNr., Bank
  const fussZeile1 = [
    [b.firma, b.strasse, `${b.plz} ${b.ort}`.trim()].filter(Boolean).join(", "),
    b.inhaber ? `Ansprechpartner: ${b.inhaber}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  const fussZeile2 = [
    b.ustIdNr ? `USt-IdNr.: ${b.ustIdNr}` : "",
    b.bank ? `Bank: ${b.bank}` : "",
    b.iban ? `IBAN: ${b.iban}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (fussZeile1 || fussZeile2) {
    doc.moveDown(0.8);
    doc.fillColor(grau).fontSize(8);
    if (fussZeile1) doc.text(fussZeile1, { width: breite });
    if (fussZeile2) doc.text(fussZeile2, { width: breite });
  }

  doc.end();
  return fertig;
}
