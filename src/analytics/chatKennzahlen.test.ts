import { describe, it, expect } from "vitest";
import { berechneChatKennzahlen, median, perzentil, type KennzahlEvent } from "./chatKennzahlen.js";

const t0 = new Date("2026-09-10T08:00:00Z");
const min = (m: number) => new Date(t0.getTime() + m * 60_000);
const ev = (typ: string, hw: string | null, data: Record<string, unknown> = {}): KennzahlEvent => ({ typ, handwerkerId: hw, dataJson: JSON.stringify(data), erstelltAm: t0 });

describe("Chat-Kennzahlen (Stufe 1, ohne Inhalte)", () => {
  it("zählt Kanäle, Vorgänge, Zeit bis Angebot, Rückfragen, Fassungen, Knöpfe, Links, Wandfotos", () => {
    const k = berechneChatKennzahlen({
      events: [
        ev("NACHRICHT_EMPFANGEN", "a", { kanal: "sprache" }),
        ev("NACHRICHT_EMPFANGEN", "a", { kanal: "foto" }),
        ev("NACHRICHT_EMPFANGEN", "b", { kanal: "text" }),
        ev("NACHRICHT_EMPFANGEN", "b", { kanal: "knopf" }),
        ev("NACHRICHT_EMPFANGEN", "test", { kanal: "sprache" }), // ausgeschlossen
        ev("NACHRICHT_BLOCKIERT", "c", { kanal: "sprache" }),
        ev("RUECKFRAGE", "a", { runde: 1 }),
        ev("ANGEBOT_KNOPF", "a", { knopf: "raum_weiter" }),
        ev("ANGEBOT_KNOPF", "a", { knopf: "korrigieren" }),
        ev("ANGEBOT_KNOPF", "b", { knopf: "korrigieren" }),
        ev("LINK_GEOEFFNET", "a", { ziel: "editor", geraet: "mobil" }),
        ev("LINK_GEOEFFNET", "b", { ziel: "editor", geraet: "desktop" }),
        ev("AUSWERTUNG_UEBERHOLT", "a"),
        ev("WANDFOTO", "a", { komplett: true, nachfassen: false }),
        ev("WANDFOTO", "a", { komplett: false, nachfassen: true }),
      ],
      vorgaenge: [
        { handwerkerId: "a", status: "ABGESCHLOSSEN", runde: 1, begonnenAm: t0, letzteAktivitaet: min(10), dokumentId: "d1", fehlversuche: 0 },
        { handwerkerId: "b", status: "ABGESCHLOSSEN", runde: 0, begonnenAm: t0, letzteAktivitaet: min(4), dokumentId: "d2", fehlversuche: 2 },
        { handwerkerId: "b", status: "ABGESCHLOSSEN", runde: 0, begonnenAm: t0, letzteAktivitaet: min(30), dokumentId: null, fehlversuche: 0 }, // Abbruch
        { handwerkerId: "c", status: "OFFEN", runde: 0, begonnenAm: t0, letzteAktivitaet: min(1), dokumentId: null, fehlversuche: 0 },
        { handwerkerId: "test", status: "ABGESCHLOSSEN", runde: 0, begonnenAm: t0, letzteAktivitaet: min(1), dokumentId: "d9", fehlversuche: 0 },
      ],
      dokumente: [
        { id: "d1", handwerkerId: "a", nummer: "ANG-2026-0001", version: 1, erstelltAm: min(6) },
        { id: "d1b", handwerkerId: "a", nummer: "ANG-2026-0001", version: 2, erstelltAm: min(12) },
        { id: "d2", handwerkerId: "b", nummer: "ANG-2026-0002", version: 1, erstelltAm: min(2) },
        { id: "d9", handwerkerId: "test", nummer: "ANG-2026-0009", version: 1, erstelltAm: min(1) },
      ],
      ausgeschlossen: new Set(["test"]),
    });
    expect(k.nachrichten).toEqual({ gesamt: 4, sprache: 1, foto: 1, text: 1, knopf: 1, blockiert: 1 });
    expect(k.vorgaenge).toEqual({ gesamt: 4, mitAngebot: 2, abgebrochen: 1, offen: 1, mitFehlversuchen: 1, ueberholt: 1 });
    expect(k.zeitBisAngebot).toEqual({ anzahl: 2, medianMin: 4, p90Min: 6 });
    expect(k.rueckfragen).toEqual({ anzahl: 1, vorgaengeMitRueckfrage: 1, quoteProzent: 25, maxRunde: 1 });
    expect(k.fassungen).toEqual({ angebote: 2, mitKorrektur: 1, quoteProzent: 50, schnittFassungen: 1.5 });
    expect(k.knoepfe).toEqual({ raumWeiter: 1, korrigieren: 2 });
    expect(k.links).toEqual({ gesamt: 2, jeZiel: { editor: 2 }, jeGeraet: { mobil: 1, desktop: 1 } });
    expect(k.wandfotos).toEqual({ anzahl: 2, komplettProzent: 50, nachfassenProzent: 50 });
  });

  it("leere Daten ergeben Nullen und null-Quoten statt Fehlern", () => {
    const k = berechneChatKennzahlen({ events: [], vorgaenge: [], dokumente: [], ausgeschlossen: new Set() });
    expect(k.nachrichten.gesamt).toBe(0);
    expect(k.zeitBisAngebot.medianMin).toBeNull();
    expect(k.rueckfragen.quoteProzent).toBeNull();
    expect(k.fassungen.schnittFassungen).toBeNull();
    expect(k.wandfotos.komplettProzent).toBeNull();
  });

  it("Median und Perzentil", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(perzentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(median([])).toBeNull();
  });
});
