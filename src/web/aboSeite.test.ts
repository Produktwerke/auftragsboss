import { describe, it, expect } from "vitest";
import { aboSeite } from "./aboSeite.js";
import type { Handwerker } from "@prisma/client";

const handwerker = { id: "hw1", firma: "Maler Müller GmbH", name: "Max Müller", istTest: false, logoDatei: null } as unknown as Handwerker;
const basis = { handwerker, token: "einst-token-1", werbeUrl: "https://api.auftragsboss.de/einladung/abc", aboBuchbar: true };

describe("Abo & Abrechnung: Kundenportal (Stripe Etappe 3)", () => {
  it("zeigt bei aktivem Online-Abo den Knopf „Abo verwalten“ mit Portal-Link", () => {
    const html = aboSeite({ ...basis, abo: { tarif: "PROFI", monatspreis: 79, status: "AKTIV" }, hatStripeKunde: true, portalVerfuegbar: true, gekuendigtZum: null });
    expect(html).toContain("/abo/verwalten/einst-token-1");
    expect(html).toContain("Abo verwalten");
    expect(html).toContain("Aktiv");
    expect(html).not.toContain("Gekündigt zum");
  });

  it("zeigt eine vorgemerkte Kündigung mit Datum und Rücknahme-Hinweis", () => {
    const html = aboSeite({ ...basis, abo: { tarif: "BASIS", monatspreis: 29, status: "AKTIV" }, hatStripeKunde: true, portalVerfuegbar: true, gekuendigtZum: new Date(2026, 9, 14) });
    expect(html).toContain("Gekündigt zum <b>14.10.2026</b>");
    expect(html).toContain("Endet 14.10.2026");
    expect(html).toContain("zurücknehmen");
  });

  it("zeigt offenes Guthaben mit Hinweis auf die Verrechnung, sonst nichts", () => {
    const mit = aboSeite({ ...basis, abo: { tarif: "PROFI", monatspreis: 79, status: "AKTIV" }, hatStripeKunde: true, portalVerfuegbar: true, guthabenEuro: 100 });
    expect(mit).toContain("Dein Guthaben");
    expect(mit).toContain("100,00");
    expect(mit).toContain("nächsten Rechnungen verrechnet");
    const ohne = aboSeite({ ...basis, abo: { tarif: "PROFI", monatspreis: 79, status: "AKTIV" }, hatStripeKunde: true, portalVerfuegbar: true, guthabenEuro: 0 });
    expect(ohne).not.toContain("Dein Guthaben");
  });

  it("ohne Stripe-Kunde (manuelles Abo) kein Portal-Knopf", () => {
    const html = aboSeite({ ...basis, abo: { tarif: "INDIVIDUELL", monatspreis: 60, status: "AKTIV" }, hatStripeKunde: false, portalVerfuegbar: false });
    expect(html).not.toContain("/abo/verwalten/");
  });
});
