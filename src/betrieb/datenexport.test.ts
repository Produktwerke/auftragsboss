import { describe, it, expect } from "vitest";
import { csvFeld, csvZeilen, betriebExport, dokumentExport } from "./datenexport.js";
import type { Dokument, Handwerker } from "@prisma/client";

describe("Datenexport: CSV und Objekte", () => {
  it("CSV nach deutscher Excel-Konvention", () => {
    expect(csvFeld(12.5)).toBe("12,50");
    expect(csvFeld(3)).toBe("3");
    expect(csvFeld("Müller; Sohn")).toBe('"Müller; Sohn"');
    expect(csvFeld('Sagt "Hallo"')).toBe('"Sagt ""Hallo"""');
    expect(csvFeld(null)).toBe("");
    expect(csvFeld(new Date("2026-09-17T10:00:00Z"))).toBe("2026-09-17");
    const csv = csvZeilen(["A", "B"], [[1, "x"], [2.25, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("A;B\r\n1;x\r\n2,25;\r\n");
  });

  it("betrieb.json enthält keine Tokens und keine internen Zähler", () => {
    const h = { firma: "Maler Müller", name: "Max", email: "m@x.de", whatsappNummer: "4917612345678", einstellungenToken: "GEHEIM", werbeCode: "CODE", testNachrichten: 7, guthabenEuro: 100, erstelltAm: new Date(), istTest: false, preisGedaechtnisAktiv: true, zusammenfassungAktiv: true, materialGetrennt: false, zeige35a: true, lohnanteilProzent: 75, mailStandard: false } as unknown as Handwerker;
    const e = betriebExport(h);
    expect(JSON.stringify(e)).not.toContain("GEHEIM");
    expect(JSON.stringify(e)).not.toContain("CODE");
    expect(e).not.toHaveProperty("testNachrichten");
    expect(e).not.toHaveProperty("guthabenEuro");
    expect(e.firma).toBe("Maler Müller");
  });

  it("dokumentExport liefert Positionen als Objekte, keine Tokens", () => {
    const d = { nummer: "ANG-2026-0001", art: "ANGEBOT", version: 2, datum: new Date(), erstelltAm: new Date(), positionenJson: JSON.stringify([{ beschreibung: "Wände streichen", menge: 40, einheit: "m²", einzelpreis: 12 }]), rueckfragenJson: "[]", bearbeitenToken: "TOK1", kundenToken: "TOK2", kundeName: "Frau Schmidt", netto: 480, mwstSatz: 19, mwstBetrag: 91.2, brutto: 571.2, anzahlOffen: 0, transkript: "Wohnzimmer streichen", einleitung: "", schlusstext: "" } as unknown as Dokument;
    const e = dokumentExport(d);
    expect((e.positionen as unknown[]).length).toBe(1);
    expect(JSON.stringify(e)).not.toContain("TOK1");
    expect(JSON.stringify(e)).not.toContain("TOK2");
    expect(e.fassung).toBe(2);
    expect((e.kunde as { name: string }).name).toBe("Frau Schmidt");
  });
});
