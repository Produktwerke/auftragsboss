import { describe, it, expect } from "vitest";
import { vertragsendeAktion, istAboEndePause, loeschDatum, ABO_ENDE_PRAEFIX } from "./vertragsende.js";

const TAG = 86_400_000;
const ende = new Date("2026-09-01T12:00:00Z");
const nach = (t: number) => new Date(ende.getTime() + t * TAG);
const betrieb = { istTest: false, blockiert: false, blockiertGrund: null };
const abo = { status: "GEKUENDIGT", gekuendigtAm: ende };

describe("Vertragsende: 30 Tage Zugriff, Pause, Vorwarnung, Löschung nach 90 Tagen", () => {
  it("bis Tag 29 nichts, ab Tag 30 Pause", () => {
    expect(vertragsendeAktion(betrieb, abo, null, nach(29))).toBeNull();
    expect(vertragsendeAktion(betrieb, abo, null, nach(30))).toBe("PAUSE");
    expect(vertragsendeAktion({ ...betrieb, blockiert: true, blockiertGrund: `${ABO_ENDE_PRAEFIX} x` }, abo, null, nach(45))).toBeNull();
  });

  it("Tag 83 Vorwarnung, Tag 90 Löschung nur mit 7 Tage alter Vorwarnung", () => {
    const pausiert = { ...betrieb, blockiert: true, blockiertGrund: `${ABO_ENDE_PRAEFIX} x` };
    expect(vertragsendeAktion(pausiert, abo, null, nach(83))).toBe("VORWARNUNG");
    expect(vertragsendeAktion(pausiert, abo, nach(83), nach(89))).toBeNull();
    expect(vertragsendeAktion(pausiert, abo, nach(83), nach(90))).toBe("LOESCHEN");
    // Vorwarnung erst spät verschickt → Löschung wartet die 7 Tage ab
    expect(vertragsendeAktion(pausiert, abo, nach(88), nach(90))).toBeNull();
    expect(vertragsendeAktion(pausiert, abo, nach(88), nach(95))).toBe("LOESCHEN");
    // Nie vorgewarnt (z. B. Job stand): erst Vorwarnung, nie direkt löschen
    expect(vertragsendeAktion(pausiert, abo, null, nach(120))).toBe("VORWARNUNG");
  });

  it("Test-Konten, aktive Abos und Betriebe ohne Abo bleiben unberührt", () => {
    expect(vertragsendeAktion({ ...betrieb, istTest: true }, abo, null, nach(100))).toBeNull();
    expect(vertragsendeAktion(betrieb, { status: "AKTIV", gekuendigtAm: null }, null, nach(100))).toBeNull();
    expect(vertragsendeAktion(betrieb, null, null, nach(100))).toBeNull();
  });

  it("Hilfsfunktionen", () => {
    expect(istAboEndePause(`${ABO_ENDE_PRAEFIX} Abo beendet`)).toBe(true);
    expect(istAboEndePause("Zahlung ausstehend")).toBe(false);
    expect(loeschDatum(ende).toISOString()).toBe(nach(90).toISOString());
  });
});
