import { describe, it, expect } from "vitest";
import { faelligFuerErinnerung } from "./leadErinnerung.js";

const TAG = 24 * 60 * 60 * 1000;
const jetzt = new Date("2026-09-15T10:00:00Z");
const vorTagen = (t: number) => new Date(jetzt.getTime() - t * TAG);
const basis = { leadQuelle: "TELEFON", onboardingStatus: "GELESEN", blockiert: false, erstelltAm: vorTagen(3) };
const eingeladen = new Set(["LEAD_EINLADUNG_GESENDET"]);

describe("Lead-Erinnerung: Fälligkeit", () => {
  it("fällig: Lead, eingeladen, nichts eingesprochen, 2 Tage alt", () => {
    expect(faelligFuerErinnerung(basis, eingeladen, 2, jetzt)).toBe(true);
    expect(faelligFuerErinnerung({ ...basis, onboardingStatus: "ERKLAERT" }, eingeladen, 2, jetzt)).toBe(true);
  });

  it("nicht fällig: zu jung, schon erinnert, schon aktiv, blockiert, kein Lead, keine Einladung, zu alt", () => {
    expect(faelligFuerErinnerung({ ...basis, erstelltAm: vorTagen(1) }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung(basis, new Set(["LEAD_EINLADUNG_GESENDET", "LEAD_ERINNERUNG"]), 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, onboardingStatus: "WARTET_AUF_AUFTRAG" }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, onboardingStatus: "AKTIV" }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, onboardingStatus: "EINLADUNG_FEHLGESCHLAGEN" }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, blockiert: true }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, leadQuelle: null }, eingeladen, 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung(basis, new Set(), 2, jetzt)).toBe(false);
    expect(faelligFuerErinnerung({ ...basis, erstelltAm: vorTagen(40) }, eingeladen, 2, jetzt)).toBe(false);
  });
});
