import { describe, it, expect } from "vitest";
import { berechneFunnel, quelleVon, type FunnelBetrieb } from "./funnel.js";

const jetzt = new Date("2026-09-15T12:00:00Z");
const b = (id: string, teil: Partial<FunnelBetrieb>): FunnelBetrieb => ({
  id, leadQuelle: null, istTest: true, onboardingStatus: null, testNachrichten: 0,
  erstelltAm: new Date("2026-09-10T12:00:00Z"), blockiert: false, name: "", firma: "", ...teil,
});

describe("Funnel je Leadquelle", () => {
  it("zählt Stufen je Quelle und berechnet Anteile", () => {
    const betriebe = [
      b("t1", { leadQuelle: "TELEFON", onboardingStatus: "AKTIV", name: "Herr A" }),
      b("t2", { leadQuelle: "TELEFON", onboardingStatus: "GELESEN", name: "Herr B" }),
      b("t3", { leadQuelle: "TELEFON", onboardingStatus: "EINGELADEN", name: "Herr C" }),
      b("t4", { leadQuelle: "TELEFON", onboardingStatus: "EINLADUNG_FEHLGESCHLAGEN", name: "Herr D" }),
      b("w1", { leadQuelle: "WEBSITE", onboardingStatus: "WARTET_AUF_AUFTRAG", name: "Frau E" }),
      b("d1", { testNachrichten: 3 }),
      b("d2", { istTest: false, firma: "Maler Z" }),
    ];
    const events = new Map<string, Set<string>>([
      ["t1", new Set(["LEAD_EINLADUNG_GESENDET", "LEAD_ZUGESTELLT", "LEAD_GELESEN", "LEAD_KNOPF", "LEAD_ERSTE_EINGABE"])],
      ["t2", new Set(["LEAD_EINLADUNG_GESENDET", "LEAD_ZUGESTELLT", "LEAD_GELESEN", "LEAD_ERINNERUNG"])],
      ["t3", new Set(["LEAD_EINLADUNG_GESENDET"])],
      ["t4", new Set(["LEAD_EINLADUNG_GESENDET", "LEAD_EINLADUNG_FEHLGESCHLAGEN"])],
      ["w1", new Set(["LEAD_EINLADUNG_GESENDET", "LEAD_KNOPF"])],
    ]);
    const erg = berechneFunnel({
      betriebe, eventsJeBetrieb: events,
      angeboteJeBetrieb: new Map([["t1", 2], ["d1", 1], ["d2", 27]]),
      aboBetriebe: new Set(["d2"]), jetzt,
    });
    const tel = erg.quellen.find((q) => q.quelle === "TELEFON")!;
    const werte = Object.fromEntries(tel.stufen.map((s) => [s.key, s.anzahl]));
    expect(tel.leads).toBe(4);
    expect(werte).toEqual({ leads: 4, eingeladen: 4, zugestellt: 2, gelesen: 2, knopf: 1, eingabe: 1, angebot: 1, abo: 0 });
    expect(tel.stufen.find((s) => s.key === "zugestellt")!.anteil).toBe(50);

    const web = erg.quellen.find((q) => q.quelle === "WEBSITE")!;
    // Knopf geklickt zählt als zugestellt + gelesen, auch ohne Status-Callback
    expect(Object.fromEntries(web.stufen.map((s) => [s.key, s.anzahl]))).toMatchObject({ leads: 1, zugestellt: 1, gelesen: 1, knopf: 1, eingabe: 0 });

    const direkt = erg.quellen.find((q) => q.quelle === "DIREKT")!;
    expect(direkt.leads).toBe(2);
    expect(direkt.stufen.find((s) => s.key === "eingeladen")!.anwendbar).toBe(false);
    expect(Object.fromEntries(direkt.stufen.map((s) => [s.key, s.anzahl]))).toMatchObject({ eingabe: 2, angebot: 2, abo: 1 });
  });

  it("listet offene Leads zum Nachfassen, aktive und blockierte nicht", () => {
    const betriebe = [
      b("t1", { leadQuelle: "TELEFON", onboardingStatus: "AKTIV", name: "Herr A" }),
      b("t2", { leadQuelle: "TELEFON", onboardingStatus: "GELESEN", name: "Herr B", erstelltAm: new Date("2026-09-12T12:00:00Z") }),
      b("t3", { leadQuelle: "TELEFON", onboardingStatus: "EINGELADEN", name: "Herr C", blockiert: true }),
      b("d1", { testNachrichten: 3 }),
    ];
    const erg = berechneFunnel({
      betriebe, eventsJeBetrieb: new Map([["t2", new Set(["LEAD_ERINNERUNG"])]]),
      angeboteJeBetrieb: new Map(), aboBetriebe: new Set(), jetzt,
    });
    expect(erg.offeneLeads).toHaveLength(1);
    expect(erg.offeneLeads[0]).toMatchObject({ id: "t2", anzeige: "Herr B", zustandLabel: "gelesen", tage: 3, erinnert: true });
  });

  it("ordnet Quellen zu", () => {
    expect(quelleVon({ leadQuelle: "TELEFON" })).toBe("TELEFON");
    expect(quelleVon({ leadQuelle: "WEBSITE" })).toBe("WEBSITE");
    expect(quelleVon({ leadQuelle: null })).toBe("DIREKT");
  });
});
