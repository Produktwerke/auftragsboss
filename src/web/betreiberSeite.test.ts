import { describe, it, expect } from "vitest";
import { betreiberListe, betreiberDetail, betreiberUmsatz, istInaktiv, type BetriebZeile } from "./betreiberSeite.js";

const TAG = 24 * 60 * 60 * 1000;

function zeile(teil: Partial<BetriebZeile> = {}): BetriebZeile {
  return {
    id: "h1",
    firma: "Malerbetrieb Muster",
    name: "Max Mustermann",
    whatsappNummer: "4917612345678",
    email: "max@muster.de",
    istTest: false,
    blockiert: false,
    erstelltAm: new Date("2026-06-01"),
    guthabenEuro: 0,
    angebote: 3,
    letzteAktivitaet: new Date(),
    tarif: null,
    aboStatus: null,
    umsatz: 0,
    ...teil,
  };
}

const PRESETS = { BASIS: 49, PROFI: 99, TEAM: 199 };
const KEINE_ALARME = { inaktiveKunden: [], testAmLimit: [], rueckfragen: [] };

describe("istInaktiv", () => {
  const jetzt = new Date("2026-08-11T12:00:00Z");

  it("aktiv, wenn letzte Aktivität jünger als 7 Tage", () => {
    expect(istInaktiv({ letzteAktivitaet: new Date(jetzt.getTime() - 6 * TAG), erstelltAm: new Date(0) }, jetzt)).toBe(false);
  });

  it("inaktiv, wenn letzte Aktivität älter als 7 Tage", () => {
    expect(istInaktiv({ letzteAktivitaet: new Date(jetzt.getTime() - 8 * TAG), erstelltAm: new Date(0) }, jetzt)).toBe(true);
  });

  it("ohne Aktivität zählt das Anmeldedatum", () => {
    expect(istInaktiv({ letzteAktivitaet: null, erstelltAm: new Date(jetzt.getTime() - 2 * TAG) }, jetzt)).toBe(false);
    expect(istInaktiv({ letzteAktivitaet: null, erstelltAm: new Date(jetzt.getTime() - 10 * TAG) }, jetzt)).toBe(true);
  });
});

describe("betreiberListe", () => {
  const kpis = {
    gesamt: 2, kunden: 1, test: 1, blockiert: 0, angeboteGesamt: 5, angebote7Tage: 2,
    mrr: 148, einnahmenMonat: 49, gesamtUmsatz: 490, kiKostenMonatCent: 231,
  };

  it("zeigt Betriebe mit Status-Badges", () => {
    const html = betreiberListe({
      basis: "/admin/tok",
      filter: "alle",
      zeilen: [zeile(), zeile({ id: "h2", firma: "Testkonto", istTest: true })],
      kpis,
      alarme: KEINE_ALARME,
    });
    expect(html).toContain("Malerbetrieb Muster");
    expect(html).toContain(">aktiv<");
    expect(html).toContain(">Test<");
    expect(html).toContain("/admin/tok/betrieb/h1");
    expect(html).toContain("2,31"); // KI-Kosten-KPI aus Cent
    expect(html).not.toContain("Warnsignale");
  });

  it("blockiert schlägt Test-Badge", () => {
    const html = betreiberListe({ basis: "/b", filter: "alle", zeilen: [zeile({ istTest: true, blockiert: true })], kpis, alarme: KEINE_ALARME });
    expect(html).toContain(">blockiert<");
  });

  it("escapet HTML in Firmennamen", () => {
    const html = betreiberListe({ basis: "/b", filter: "alle", zeilen: [zeile({ firma: `<script>alert(1)</script>` })], kpis, alarme: KEINE_ALARME });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("zeigt Warnsignale mit Links", () => {
    const html = betreiberListe({
      basis: "/admin/tok",
      filter: "alle",
      zeilen: [zeile()],
      kpis,
      alarme: {
        inaktiveKunden: [{ id: "h1", firma: "Malerbetrieb Muster", tage: 9 }],
        testAmLimit: [{ id: "h9", firma: "+4915711", nachrichten: 12, limit: 12 }],
        rueckfragen: [{ id: "h1", firma: "Malerbetrieb Muster", nummer: "ANG-2026-0004", datum: new Date() }],
      },
    });
    expect(html).toContain("Warnsignale");
    expect(html).toContain("seit 9 Tagen inaktiv");
    expect(html).toContain("12/12 Nachrichten");
    expect(html).toContain("ANG-2026-0004");
    expect(html).toContain("/admin/tok/betrieb/h9");
  });
});

describe("betreiberDetail", () => {
  function detailHtml(teil: Partial<Parameters<typeof betreiberDetail>[0]> = {}): string {
    return betreiberDetail({
      basis: "/admin/tok",
      betrieb: { ...zeile(), blockiertGrund: null, blockiertAm: null, gewerkTyp: "MALER", ort: "Berlin" },
      usage: { versandbereit: 1, offenePreise: 2, versendet: 3, protokolle: 0 },
      angebote: [
        { nummer: "ANG-2026-0001", datum: new Date(), brutto: 1000, anzahlOffen: 0, versendet: true },
        { nummer: "ANG-2026-0002", datum: new Date(), brutto: 500, anzahlOffen: 2, versendet: false },
        { nummer: "ANG-2026-0003", datum: new Date(), brutto: 700, anzahlOffen: 0, versendet: false },
      ],
      empfehlungen: [],
      logs: [],
      abo: null,
      buchungen: [],
      aktuellerZeitraum: "2026-08",
      tarifPresets: PRESETS,
      kiKosten: { cent30Tage: 123, centGesamt: 456 },
      ...teil,
    });
  }

  it("zeigt KI-Kosten und Als-Kunde-Knöpfe", () => {
    const html = detailHtml();
    expect(html).toContain("1,23"); // 30 Tage
    expect(html).toContain("4,56"); // gesamt
    expect(html).toContain(`/admin/tok/betrieb/h1/als-kunde`);
    expect(html).toContain("Kunden-Cockpit öffnen");
    expect(html).toContain("ziel=einstellungen");
  });

  it("zeigt Usage-Zahlen und Angebots-Status", () => {
    const html = detailHtml();
    expect(html).toContain(">versendet<");
    expect(html).toContain("2 Preise offen");
    expect(html).toContain(">versandbereit<");
    expect(html).toContain("Angebote gesamt");
  });

  it("verweist auf alle Aktions-Endpunkte", () => {
    const html = detailHtml();
    for (const pfad of ["kontakt", "blockieren", "gutschrift", "loeschen", "abo", "zahlung"]) {
      expect(html).toContain(`/admin/tok/betrieb/h1/${pfad}`);
    }
  });

  it("ohne Abo: Anlegen-Knopf, kein Kündigen", () => {
    const html = detailHtml();
    expect(html).toContain("Abo anlegen");
    expect(html).not.toContain("abo-kuendigen");
  });

  it("mit aktivem Abo: Ändern + Kündigen + vorbelegter Zahlbetrag", () => {
    const html = detailHtml({
      abo: { tarif: "PROFI", monatspreis: 99, status: "AKTIV", beginntAm: new Date("2026-07-01"), gekuendigtAm: null },
    });
    expect(html).toContain("Abo ändern");
    expect(html).toContain("abo-kuendigen");
    expect(html).toContain(`value="99"`);
  });

  it("Guthaben-verrechnen-Formular nur bei offenem Guthaben; Gutschrift in Euro mit 100 € vorbelegt", () => {
    const ohne = detailHtml();
    expect(ohne).not.toContain("Guthaben verrechnen");
    expect(ohne).toContain("Gutschrift (Euro)");
    expect(ohne).toContain(`value="100"`);
    const mit = detailHtml({
      betrieb: { ...zeile({ guthabenEuro: 100 }), blockiertGrund: null, blockiertAm: null, gewerkTyp: "MALER", ort: null },
    });
    expect(mit).toContain("Guthaben verrechnen (100,00 € offen)");
    expect(mit).toContain("guthaben-verrechnen");
  });

  it("offene Empfehlung hat den Knopf zum Aktivieren mit der 100-€-Prämie", () => {
    const html = detailHtml({
      empfehlungen: [
        { id: "e1", firma: "Malermeister Krause", name: "Kai Krause", status: "OFFEN", erstelltAm: new Date("2026-09-01") },
        { id: "e2", firma: "Maler Schmidt", name: "S. Schmidt", status: "AKTIVIERT", erstelltAm: new Date("2026-08-01") },
      ],
    });
    expect(html).toContain("empfehlung/e1/aktivieren");
    expect(html).toContain("Ist Kunde: 100 € gutschreiben");
    expect(html).not.toContain("empfehlung/e2/aktivieren");
    expect(html).toContain("Prämie ausgezahlt");
  });

  it("zeigt die Zahlungshistorie", () => {
    const html = detailHtml({
      buchungen: [{ typ: "ZAHLUNG", betrag: 49, zeitraum: "2026-08", notiz: "Überweisung", erstelltAm: new Date() }],
    });
    expect(html).toContain("Zahlungshistorie");
    expect(html).toContain("Überweisung");
    expect(html).toContain("49,00");
  });

  it("zeigt bei blockiertem Konto Entsperren statt Blockieren", () => {
    const html = detailHtml({
      betrieb: {
        ...zeile({ blockiert: true }),
        blockiertGrund: "Zahlung offen",
        blockiertAm: new Date(),
        gewerkTyp: "MALER",
        ort: null,
      },
    });
    expect(html).toContain("entsperren");
    expect(html).toContain("Zahlung offen");
    expect(html).not.toContain(`data-post="/admin/tok/betrieb/h1/blockieren"`);
  });
});

describe("betreiberUmsatz", () => {
  it("zeigt KPIs, Balken und Kundenliste", () => {
    const html = betreiberUmsatz({
      basis: "/admin/tok",
      kpis: { mrr: 148, einnahmenMonat: 49, gesamtUmsatz: 490, zahlendeKunden: 2, offenesGuthaben: 300 },
      verlauf: [
        { zeitraum: "2026-07", summe: 0 },
        { zeitraum: "2026-08", summe: 49 },
      ],
      tarife: [{ tarif: "BASIS", anzahl: 1 }, { tarif: "PROFI", anzahl: 1 }],
      topKunden: [{ id: "h1", firma: "Malerbetrieb Muster", tarif: "BASIS", umsatz: 490 }],
      aktuellerZeitraum: "2026-08",
    });
    expect(html).toContain("148,00");
    expect(html).toContain("2026-07");
    expect(html).toContain("2026-08");
    expect(html).toContain("BASIS: 1");
    expect(html).toContain("/admin/tok/betrieb/h1");
    expect(html).toContain("490,00");
  });

  it("leerer Zustand ohne Buchungen", () => {
    const html = betreiberUmsatz({
      basis: "/b",
      kpis: { mrr: 0, einnahmenMonat: 0, gesamtUmsatz: 0, zahlendeKunden: 0, offenesGuthaben: 0 },
      verlauf: [],
      tarife: [],
      topKunden: [],
      aktuellerZeitraum: "2026-08",
    });
    expect(html).toContain("Noch keine Buchungen");
    expect(html).toContain("Noch keine aktiven Abos");
  });
});
