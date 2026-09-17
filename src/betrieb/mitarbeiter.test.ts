import { describe, it, expect, vi } from "vitest";
import { erlaubteMitarbeiter, fuegeMitarbeiterHinzu, entferneMitarbeiter, findeBetriebZuNummer, tarifLabelFuerNummern } from "./mitarbeiter.js";
import type { Handwerker, PrismaClient } from "@prisma/client";

const inhaber = { id: "hw1", firma: "Maler Müller", name: "Max", whatsappNummer: "4917611111111", istTest: false } as Handwerker;

function fakePrisma(v: { anzahl?: number; fremdBetrieb?: boolean; fremdMitarbeiter?: string | null; mitarbeiter?: unknown } = {}) {
  const aufrufe: Record<string, unknown[]> = { create: [], delete: [], adminLog: [] };
  const p = {
    handwerker: { findUnique: vi.fn(async (a: { where: { whatsappNummer?: string } }) => (a.where.whatsappNummer === inhaber.whatsappNummer ? inhaber : v.fremdBetrieb ? { id: "hw9" } : null)) },
    mitarbeiter: {
      count: vi.fn(async () => v.anzahl ?? 0),
      findUnique: vi.fn(async () => (v.fremdMitarbeiter ? { handwerkerId: v.fremdMitarbeiter } : null)),
      findFirst: vi.fn(async () => v.mitarbeiter ?? null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { aufrufe.create.push(a); return { id: "m1", ...a.data }; }),
      delete: vi.fn(async (a: unknown) => { aufrufe.delete.push(a); return {}; }),
    },
    adminLog: { create: vi.fn(async (a: unknown) => { aufrufe.adminLog.push(a); return {}; }) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}

describe("Mitarbeiter-Nummern", () => {
  it("Grenzen je Tarif", () => {
    expect(erlaubteMitarbeiter({ tarif: "BASIS", status: "AKTIV" }, false)).toBe(0);
    expect(erlaubteMitarbeiter({ tarif: "PROFI", status: "AKTIV" }, false)).toBe(2);
    expect(erlaubteMitarbeiter({ tarif: "TEAM", status: "AKTIV" }, false)).toBe(14);
    expect(erlaubteMitarbeiter({ tarif: "TEAM", status: "GEKUENDIGT" }, false)).toBe(0);
    expect(erlaubteMitarbeiter({ tarif: "TEAM", status: "AKTIV" }, true)).toBe(0);
    expect(erlaubteMitarbeiter(null, false)).toBe(0);
    expect(tarifLabelFuerNummern({ tarif: "PROFI", status: "AKTIV" }, false)).toContain("bis zu 2 weitere");
  });

  it("fügt hinzu: normalisiert, prüft Limit, Doppelte und fremde Konten", async () => {
    const ok = fakePrisma();
    const e = await fuegeMitarbeiterHinzu(ok.p, inhaber, { tarif: "PROFI", status: "AKTIV" }, { name: "Ali", nummer: "0176 2222222" });
    expect(e.ok).toBe(true);
    expect((ok.aufrufe.create[0] as { data: { whatsappNummer: string } }).data.whatsappNummer).toBe("491762222222");

    const voll = await fuegeMitarbeiterHinzu(fakePrisma({ anzahl: 2 }).p, inhaber, { tarif: "PROFI", status: "AKTIV" }, { name: "Ali", nummer: "01763333333" });
    expect(voll.ok).toBe(false);
    const basis = await fuegeMitarbeiterHinzu(fakePrisma().p, inhaber, { tarif: "BASIS", status: "AKTIV" }, { name: "Ali", nummer: "01763333333" });
    expect(basis.ok).toBe(false);
    const eigene = await fuegeMitarbeiterHinzu(fakePrisma().p, inhaber, { tarif: "TEAM", status: "AKTIV" }, { name: "Ali", nummer: "+49 176 11111111" });
    expect(eigene).toMatchObject({ ok: false, fehler: "Das ist deine eigene Nummer." });
    const fremd = await fuegeMitarbeiterHinzu(fakePrisma({ fremdBetrieb: true }).p, inhaber, { tarif: "TEAM", status: "AKTIV" }, { name: "Ali", nummer: "01763333333" });
    expect(fremd.ok).toBe(false);
    const fremdM = await fuegeMitarbeiterHinzu(fakePrisma({ fremdMitarbeiter: "hw9" }).p, inhaber, { tarif: "TEAM", status: "AKTIV" }, { name: "Ali", nummer: "01763333333" });
    expect((fremdM as { fehler: string }).fehler).toContain("anderen Betrieb");
  });

  it("entfernt nur eigene Mitarbeiter", async () => {
    const eigen = fakePrisma({ mitarbeiter: { id: "m1", name: "Ali" } });
    expect(await entferneMitarbeiter(eigen.p, inhaber, "m1")).toBe(true);
    expect(eigen.aufrufe.delete).toHaveLength(1);
    expect(await entferneMitarbeiter(fakePrisma().p, inhaber, "m9")).toBe(false);
  });

  it("findet den Betrieb zu Inhaber- und Mitarbeiter-Nummer", async () => {
    const p = {
      handwerker: { findUnique: vi.fn(async (a: { where: { whatsappNummer: string } }) => (a.where.whatsappNummer === "1" ? inhaber : null)) },
      mitarbeiter: { findUnique: vi.fn(async (a: { where: { whatsappNummer: string } }) => (a.where.whatsappNummer === "2" ? { id: "m1", whatsappNummer: "2", handwerker: inhaber } : null)) },
    } as unknown as PrismaClient;
    expect((await findeBetriebZuNummer(p, "1"))?.mitarbeiter).toBeNull();
    expect((await findeBetriebZuNummer(p, "2"))?.mitarbeiter?.id).toBe("m1");
    expect(await findeBetriebZuNummer(p, "3")).toBeNull();
  });
});
