import { describe, it, expect, vi } from "vitest";
import { naechsterZustand, verarbeiteNachrichtStatus, zustandLabel } from "./status.js";
import type { PrismaClient } from "@prisma/client";

function fakePrisma(h: { leadQuelle: string | null; onboardingStatus: string | null } | null, updateCount = 1) {
  const aufrufe: Record<string, unknown[]> = { updateMany: [], events: [], adminLog: [] };
  const p = {
    handwerker: {
      findUnique: vi.fn(async () => (h ? { id: "hw1", firma: "", name: "Herr Müller", ...h } : null)),
      updateMany: vi.fn(async (a: unknown) => { aufrufe.updateMany.push(a); return { count: updateCount }; }),
    },
    event: { create: vi.fn(async (a: unknown) => { aufrufe.events.push(a); return {}; }) },
    adminLog: { create: vi.fn(async (a: unknown) => { aufrufe.adminLog.push(a); return {}; }) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}

describe("Lead-Zustände aus Meta-Status", () => {
  it("delivered/read/failed wandern monoton, spätere Zustände bleiben unberührt", () => {
    expect(naechsterZustand("EINGELADEN", "delivered")).toBe("ZUGESTELLT");
    expect(naechsterZustand("EINGELADEN", "read")).toBe("GELESEN");
    expect(naechsterZustand("ZUGESTELLT", "read")).toBe("GELESEN");
    expect(naechsterZustand("GELESEN", "delivered")).toBeNull(); // kein Rückfall
    expect(naechsterZustand("GELESEN", "read")).toBeNull(); // schon gelesen
    expect(naechsterZustand("EINGELADEN", "failed")).toBe("EINLADUNG_FEHLGESCHLAGEN");
    expect(naechsterZustand("ZUGESTELLT", "failed")).toBeNull(); // war ja zugestellt
    expect(naechsterZustand("WARTET_AUF_AUFTRAG", "read")).toBeNull();
    expect(naechsterZustand("AKTIV", "read")).toBeNull();
    expect(naechsterZustand(null, "read")).toBeNull();
    expect(naechsterZustand("EINGELADEN", "sent")).toBeNull();
  });

  it("setzt den Zustand, schreibt das Event und bei Fehlschlag das Admin-Protokoll", async () => {
    const { p, aufrufe } = fakePrisma({ leadQuelle: "TELEFON", onboardingStatus: "EINGELADEN" });
    const neu = await verarbeiteNachrichtStatus(p, { recipient_id: "4917612345678", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] });
    expect(neu).toBe("EINLADUNG_FEHLGESCHLAGEN");
    expect((aufrufe.updateMany[0] as { data: { onboardingStatus: string } }).data.onboardingStatus).toBe("EINLADUNG_FEHLGESCHLAGEN");
    const ev = (aufrufe.events[0] as { data: { typ: string; dataJson: string } }).data;
    expect(ev.typ).toBe("LEAD_EINLADUNG_FEHLGESCHLAGEN");
    expect(JSON.parse(ev.dataJson).code).toBe(131026);
    expect((aufrufe.adminLog[0] as { data: { detail: string } }).data.detail).toContain("131026");
  });

  it("ignoriert Nicht-Leads, unbekannte Nummern und verlorene Races", async () => {
    const kein = fakePrisma({ leadQuelle: null, onboardingStatus: null });
    expect(await verarbeiteNachrichtStatus(kein.p, { recipient_id: "4917612345678", status: "read" })).toBeNull();
    expect(kein.aufrufe.adminLog).toHaveLength(0);
    const unbekannt = fakePrisma(null);
    expect(await verarbeiteNachrichtStatus(unbekannt.p, { recipient_id: "4917600000000", status: "read" })).toBeNull();
    const race = fakePrisma({ leadQuelle: "WEBSITE", onboardingStatus: "EINGELADEN" }, 0);
    expect(await verarbeiteNachrichtStatus(race.p, { recipient_id: "4917612345678", status: "read" })).toBeNull();
    expect(race.aufrufe.events).toHaveLength(0);
  });

  it("abgewiesene Antwort an einen Lead nach Knopfdruck: Zustand bleibt, Admin-Protokoll und Event (24.09.2026, Malerbetrieb Schwarz)", async () => {
    const { p, aufrufe } = fakePrisma({ leadQuelle: "TELEFON", onboardingStatus: "ERKLAERT" });
    const neu = await verarbeiteNachrichtStatus(p, { recipient_id: "4917612345678", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] });
    expect(neu).toBeNull();
    expect(aufrufe.updateMany).toHaveLength(0);
    const log = (aufrufe.adminLog[0] as { data: { aktion: string; detail: string } }).data;
    expect(log.aktion).toBe("WHATSAPP_NICHT_ZUSTELLBAR");
    expect(log.detail).toContain("131047");
    expect(log.detail).toContain("24-Stunden-Fenster");
    expect(log.detail).toContain("Erklärung angesehen");
    const ev = (aufrufe.events[0] as { data: { typ: string; dataJson: string } }).data;
    expect(ev.typ).toBe("NACHRICHT_FEHLGESCHLAGEN");
    expect(JSON.parse(ev.dataJson).code).toBe(131047);
  });

  it("abgewiesene Nachricht an einen normalen Betrieb (kein Lead) landet ebenfalls im Admin-Protokoll", async () => {
    const { p, aufrufe } = fakePrisma({ leadQuelle: null, onboardingStatus: null });
    expect(await verarbeiteNachrichtStatus(p, { recipient_id: "4917612345678", status: "failed", errors: [{ code: 131026 }] })).toBeNull();
    expect(aufrufe.adminLog).toHaveLength(1);
    expect((aufrufe.adminLog[0] as { data: { detail: string } }).data.detail).toContain("nicht bei WhatsApp erreichbar");
    // sent/delivered/read bei Nicht-Leads: weiterhin nichts
    const ruhig = fakePrisma({ leadQuelle: null, onboardingStatus: null });
    await verarbeiteNachrichtStatus(ruhig.p, { recipient_id: "4917612345678", status: "delivered" });
    expect(ruhig.aufrufe.adminLog).toHaveLength(0);
  });

  it("Einladung selbst nicht zustellbar: nur der bisherige Eintrag, kein doppeltes Protokoll", async () => {
    const { p, aufrufe } = fakePrisma({ leadQuelle: "TELEFON", onboardingStatus: "EINGELADEN" });
    await verarbeiteNachrichtStatus(p, { recipient_id: "4917612345678", status: "failed", errors: [{ code: 131026 }] });
    expect(aufrufe.adminLog).toHaveLength(1);
    expect((aufrufe.adminLog[0] as { data: { aktion: string } }).data.aktion).toBe("LEAD_EINLADUNG_FEHLGESCHLAGEN");
  });

  it("Labels sind lesbar", () => {
    expect(zustandLabel("WARTET_AUF_AUFTRAG")).toBe("hat Ja geklickt");
    expect(zustandLabel(null)).toBe("–");
  });
});
