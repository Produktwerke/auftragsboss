import { describe, it, expect } from "vitest";
import { kontingentFuer, kontingentStand, kontingentErschoepftText, kontingentHinweisText, monatsStart, naechsterMonatsStart } from "./kontingent.js";

describe("Monatskontingent zahlender Betriebe (harte Grenze)", () => {
  it("Grenzen je Tarif, ohne Abo wie Basis", () => {
    expect(kontingentFuer({ tarif: "BASIS" })).toBe(50);
    expect(kontingentFuer({ tarif: "PROFI" })).toBe(120);
    expect(kontingentFuer({ tarif: "TEAM" })).toBe(300);
    expect(kontingentFuer(null)).toBe(50);
    expect(kontingentFuer({ tarif: "UNBEKANNT" })).toBe(50);
  });

  it("Stand: frei, erschöpft", () => {
    expect(kontingentStand({ tarif: "BASIS" }, 49)).toMatchObject({ frei: 1, erschoepft: false });
    expect(kontingentStand({ tarif: "BASIS" }, 50)).toMatchObject({ frei: 0, erschoepft: true });
    expect(kontingentStand({ tarif: "BASIS" }, 57)).toMatchObject({ frei: 0, erschoepft: true, genutzt: 57 });
  });

  it("Texte: Sperre nennt Zahlen, Datum und nächsten Tarif; Hinweis nur bei den letzten 5", () => {
    const jetzt = new Date("2026-09-17T10:00:00");
    const t = kontingentErschoepftText(kontingentStand({ tarif: "BASIS" }, 50), "https://x/abo", jetzt);
    expect(t).toContain("50 von 50");
    expect(t).toContain("01.10.2026");
    expect(t).toContain("Profi (120 Angebote)");
    expect(t).toContain("https://x/abo");
    expect(kontingentErschoepftText(kontingentStand({ tarif: "TEAM" }, 300), "https://x/abo", jetzt)).not.toContain("https://x/abo");
    expect(kontingentHinweisText(kontingentStand({ tarif: "BASIS" }, 40))).toBeNull();
    expect(kontingentHinweisText(kontingentStand({ tarif: "BASIS" }, 45))).toContain("Noch 5 Angebote");
    expect(kontingentHinweisText(kontingentStand({ tarif: "BASIS" }, 49))).toContain("Noch 1 Angebot ");
    expect(kontingentHinweisText(kontingentStand({ tarif: "BASIS" }, 50))).toBeNull();
  });

  it("Monatsgrenzen", () => {
    const jetzt = new Date("2026-09-17T10:00:00");
    expect(monatsStart(jetzt).getDate()).toBe(1);
    expect(monatsStart(jetzt).getMonth()).toBe(8);
    expect(naechsterMonatsStart(jetzt).getMonth()).toBe(9);
  });
});
