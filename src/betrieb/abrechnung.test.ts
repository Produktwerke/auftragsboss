import { describe, it, expect } from "vitest";
import {
  mrr,
  monatsZeitraum,
  istZeitraum,
  istTarif,
  einnahmenImZeitraum,
  gesamtUmsatz,
  umsatzJeKunde,
  monatsverlauf,
  TARIF_PRESETS,
} from "./abrechnung.js";

describe("monatsZeitraum / istZeitraum", () => {
  it("formatiert JJJJ-MM mit führender Null", () => {
    expect(monatsZeitraum(new Date(2026, 7, 11))).toBe("2026-08");
    expect(monatsZeitraum(new Date(2026, 11, 1))).toBe("2026-12");
  });
  it("validiert Zeiträume", () => {
    expect(istZeitraum("2026-08")).toBe(true);
    expect(istZeitraum("2026-13")).toBe(false);
    expect(istZeitraum("26-08")).toBe(false);
    expect(istZeitraum("2026-8")).toBe(false);
  });
});

describe("istTarif / Presets", () => {
  it("kennt die vier Tarife", () => {
    for (const t of ["BASIS", "PROFI", "TEAM", "INDIVIDUELL"]) expect(istTarif(t)).toBe(true);
    expect(istTarif("GOLD")).toBe(false);
  });
  it("Presets passen zur Preisseite", () => {
    expect(TARIF_PRESETS.BASIS).toBe(49);
    expect(TARIF_PRESETS.PROFI).toBe(99);
    expect(TARIF_PRESETS.TEAM).toBe(199);
  });
});

describe("mrr", () => {
  it("summiert nur aktive Abos", () => {
    expect(
      mrr([
        { status: "AKTIV", monatspreis: 49 },
        { status: "AKTIV", monatspreis: 99 },
        { status: "GEKUENDIGT", monatspreis: 199 },
      ]),
    ).toBe(148);
  });
  it("leer = 0", () => {
    expect(mrr([])).toBe(0);
  });
});

describe("Umsätze aus dem Ledger", () => {
  const buchungen = [
    { handwerkerId: "a", betrag: 49, zeitraum: "2026-06" },
    { handwerkerId: "a", betrag: 49, zeitraum: "2026-08" },
    { handwerkerId: "b", betrag: 99, zeitraum: "2026-08" },
    { handwerkerId: "b", betrag: 0, zeitraum: "2026-07" }, // Freimonat
    { handwerkerId: "a", betrag: -10, zeitraum: "2026-08" }, // Korrektur
  ];

  it("Einnahmen im Zeitraum", () => {
    expect(einnahmenImZeitraum(buchungen, "2026-08")).toBe(138);
    expect(einnahmenImZeitraum(buchungen, "2026-07")).toBe(0);
    expect(einnahmenImZeitraum(buchungen, "2025-01")).toBe(0);
  });

  it("Gesamtumsatz", () => {
    expect(gesamtUmsatz(buchungen)).toBe(187);
  });

  it("Umsatz je Kunde", () => {
    const m = umsatzJeKunde(buchungen);
    expect(m.get("a")).toBe(88);
    expect(m.get("b")).toBe(99);
  });

  it("Monatsverlauf füllt Lücken mit 0", () => {
    expect(monatsverlauf(buchungen)).toEqual([
      { zeitraum: "2026-06", summe: 49 },
      { zeitraum: "2026-07", summe: 0 },
      { zeitraum: "2026-08", summe: 138 },
    ]);
  });

  it("Monatsverlauf über Jahresgrenze", () => {
    const b = [
      { handwerkerId: "a", betrag: 10, zeitraum: "2025-11" },
      { handwerkerId: "a", betrag: 20, zeitraum: "2026-02" },
    ];
    expect(monatsverlauf(b).map((v) => v.zeitraum)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("rundet EUR sauber", () => {
    expect(gesamtUmsatz([{ handwerkerId: "a", betrag: 0.1, zeitraum: "2026-01" }, { handwerkerId: "a", betrag: 0.2, zeitraum: "2026-01" }])).toBe(0.3);
  });
});
