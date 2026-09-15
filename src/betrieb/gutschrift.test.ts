import { describe, it, expect, vi } from "vitest";
import { schreibeGut, verrechneGuthaben, aktiviereEmpfehlung, nachAboAbschluss } from "./gutschrift.js";
import { EMPFEHLUNGS_PRAEMIE_EUR } from "../empfehlung.js";
import type { PrismaClient } from "@prisma/client";

const werber = { id: "hw1", firma: "Maler Müller GmbH", name: "Max", whatsappNummer: "4917611111111", guthabenEuro: 0 };

function fakePrisma(vorgaben: { abo?: unknown; empfehlung?: any; offene?: any[]; guthaben?: number } = {}) {
  const aufrufe: Record<string, unknown[]> = { buchung: [], adminLog: [], hwUpdate: [], hwUpdateMany: [], empfUpdateMany: [] };
  let guthaben = vorgaben.guthaben ?? 0;
  const tx = {
    handwerker: {
      updateMany: vi.fn(async (a: any) => {
        aufrufe.hwUpdateMany.push(a);
        const min = a.where.guthabenEuro?.gte ?? a.where.guthabenEuro;
        if (typeof min === "number" && guthaben < min) return { count: 0 };
        if (a.data.guthabenEuro?.decrement) guthaben -= a.data.guthabenEuro.decrement;
        else if (typeof a.data.guthabenEuro === "number") guthaben = a.data.guthabenEuro;
        return { count: 1 };
      }),
      update: vi.fn(async (a: any) => { aufrufe.hwUpdate.push(a); guthaben += a.data.guthabenEuro?.increment ?? 0; return {}; }),
      findUnique: vi.fn(async () => ({ ...werber, guthabenEuro: guthaben })),
    },
    buchung: { create: vi.fn(async (a: unknown) => { aufrufe.buchung.push(a); return {}; }) },
    adminLog: { create: vi.fn(async (a: unknown) => { aufrufe.adminLog.push(a); return {}; }) },
    abo: { findUnique: vi.fn(async () => vorgaben.abo ?? null) },
    empfehlung: {
      updateMany: vi.fn(async (a: any) => {
        aufrufe.empfUpdateMany.push(a);
        if (vorgaben.empfehlung?.status !== "OFFEN") return { count: 0 };
        vorgaben.empfehlung.status = "AKTIVIERT"; // wie die Datenbank: nur der erste Aufruf trifft
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => vorgaben.empfehlung ?? null),
      findMany: vi.fn(async () => vorgaben.offene ?? []),
    },
  };
  const p = { ...tx, $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) };
  return { p: p as unknown as PrismaClient, aufrufe, guthaben: () => guthaben };
}

describe("Gutschrift (Empfehlungsprämie 100 €)", () => {
  it("Stripe-Kunde: Guthaben beim Stripe-Kunden + negative GUTSCHRIFT-Zeile im Ledger", async () => {
    const stripe = vi.fn(async () => {});
    const { p, aufrufe } = fakePrisma({ abo: { stripeCustomerId: "cus_1" } });
    const erg = await schreibeGut(p, werber, 100, "Empfehlung Krause", stripe);
    expect(erg.weg).toBe("stripe");
    expect(stripe).toHaveBeenCalledWith("cus_1", 100, "Empfehlung Krause");
    const b = aufrufe.buchung[0] as { data: { typ: string; betrag: number } };
    expect(b.data.typ).toBe("GUTSCHRIFT");
    expect(b.data.betrag).toBe(-100);
    expect(aufrufe.hwUpdate).toHaveLength(0);
  });

  it("ohne Stripe-Kunde: Konto-Guthaben am Betrieb, noch keine Ledger-Zeile", async () => {
    const { p, aufrufe, guthaben } = fakePrisma();
    const erg = await schreibeGut(p, werber, 100, "Empfehlung Krause", vi.fn(async () => {}));
    expect(erg.weg).toBe("konto");
    expect(guthaben()).toBe(100);
    expect(aufrufe.buchung).toHaveLength(0);
    expect(aufrufe.adminLog).toHaveLength(1);
  });

  it("verrechnet Konto-Guthaben atomar und nie mehr als vorhanden", async () => {
    const { p, aufrufe, guthaben } = fakePrisma({ guthaben: 100 });
    expect(await verrechneGuthaben(p, werber, 60, "2026-10")).toBe(true);
    expect(guthaben()).toBe(40);
    expect(await verrechneGuthaben(p, werber, 60, "2026-10")).toBe(false);
    expect(aufrufe.buchung).toHaveLength(1);
    expect((aufrufe.buchung[0] as { data: { betrag: number } }).data.betrag).toBe(-60);
  });

  it("aktiviert eine Empfehlung genau einmal und schreibt dem Werber die Prämie gut", async () => {
    const empfehlung = { id: "e1", werberId: "hw1", firma: "Malermeister Krause", name: "Kai Krause", status: "OFFEN" };
    const { p, guthaben } = fakePrisma({ empfehlung });
    const erg = await aktiviereEmpfehlung(p, "e1", null);
    expect(erg.ok).toBe(true);
    expect(erg.weg).toBe("konto");
    expect(guthaben()).toBe(EMPFEHLUNGS_PRAEMIE_EUR);
    const nochmal = await aktiviereEmpfehlung(p, "e1", null);
    expect(nochmal.ok).toBe(false); // Status war schon AKTIVIERT (count 0)
  });

  it("nach Abo-Abschluss: Konto-Guthaben wandert nach Stripe, offene Empfehlung auf die Nummer wird aktiviert", async () => {
    const stripe = vi.fn(async () => {});
    const geworbener = { id: "hw2", firma: "Neuer Betrieb", name: "Neu", whatsappNummer: "4917622222222", guthabenEuro: 50 };
    const empfehlung = { id: "e9", werberId: "hw1", firma: "Neuer Betrieb", name: "Neu", whatsappNummer: "0176 22222222", status: "OFFEN" };
    const { p, aufrufe } = fakePrisma({ guthaben: 50, offene: [empfehlung], empfehlung });
    const erg = await nachAboAbschluss(p, geworbener, "cus_9", stripe);
    expect(erg.uebertragen).toBe(50);
    expect(erg.empfehlungAktiviert).toBe(true);
    expect(stripe).toHaveBeenCalledWith("cus_9", 50, "Übertrag Konto-Guthaben");
    expect(aufrufe.empfUpdateMany).toHaveLength(1);
  });
});
