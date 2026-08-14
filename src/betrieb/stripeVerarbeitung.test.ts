import { describe, it, expect, vi } from "vitest";
import {
  liesCheckout,
  liesRechnung,
  tarifAusLookup,
  tarifAusPreis,
  tarifLabel,
  verarbeiteStripeEvent,
} from "./stripeVerarbeitung.js";
import type { PrismaClient } from "@prisma/client";

// Kleiner Prisma-Ersatz: merkt sich Aufrufe, liefert vorbereitete Antworten.
function fakePrisma(vorgaben: {
  handwerker?: unknown;
  abo?: unknown;
  buchungVorhanden?: unknown;
  korrekturen?: unknown[];
} = {}) {
  const aufrufe: Record<string, unknown[]> = {
    aboUpsert: [], aboUpdateMany: [], buchungCreate: [], adminLogCreate: [],
  };
  const p = {
    handwerker: { findUnique: vi.fn(async () => vorgaben.handwerker ?? null) },
    abo: {
      upsert: vi.fn(async (a: unknown) => { aufrufe.aboUpsert.push(a); return {}; }),
      findFirst: vi.fn(async () => vorgaben.abo ?? null),
      updateMany: vi.fn(async (a: unknown) => { aufrufe.aboUpdateMany.push(a); return { count: 1 }; }),
    },
    buchung: {
      findFirst: vi.fn(async () => vorgaben.buchungVorhanden ?? null),
      findMany: vi.fn(async () => vorgaben.korrekturen ?? []),
      create: vi.fn(async (a: unknown) => { aufrufe.buchungCreate.push(a); return {}; }),
    },
    adminLog: { create: vi.fn(async (a: unknown) => { aufrufe.adminLogCreate.push(a); return {}; }) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}

describe("Stripe: pure Ausleser", () => {
  it("tarifAusLookup und tarifAusPreis und tarifLabel", () => {
    expect(tarifAusLookup("basis")).toBe("BASIS");
    expect(tarifAusLookup("Team")).toBe("TEAM");
    expect(tarifAusLookup("fremd")).toBeNull();
    expect(tarifAusPreis(99)).toBe("PROFI");
    expect(tarifAusPreis(83)).toBe("INDIVIDUELL");
    expect(tarifAusPreis(null)).toBe("INDIVIDUELL");
    expect(tarifLabel("BASIS")).toBe("Basis");
    expect(tarifLabel("INDIVIDUELL")).toBe("Individuell");
  });

  it("liesCheckout: Betriebszuordnung, Abo, Netto-Betrag", () => {
    const s = liesCheckout({
      client_reference_id: "hw1",
      subscription: "sub_123",
      customer: { id: "cus_9" },
      amount_subtotal: 4900,
      metadata: { tarif: "BASIS" },
    });
    expect(s).toEqual({
      handwerkerId: "hw1", subscriptionId: "sub_123", customerId: "cus_9",
      tarif: "BASIS", nettoEuro: 49,
    });
  });

  it("liesRechnung: klassische UND neue API-Form", () => {
    const klassisch = liesRechnung({
      id: "in_1", subscription: "sub_123", subtotal_excluding_tax: 9900,
      lines: { data: [{ price: { lookup_key: "profi" }, period: { start: 1786500000 } }] },
    });
    expect(klassisch.invoiceId).toBe("in_1");
    expect(klassisch.subscriptionId).toBe("sub_123");
    expect(klassisch.tarif).toBe("PROFI");
    expect(klassisch.nettoEuro).toBe(99);
    expect(klassisch.zeitraum).toBe("2026-08"); // 1786500000 = 12.08.2026

    const neu = liesRechnung({
      id: "in_2", total_excluding_tax: 19900,
      parent: { subscription_details: { subscription: "sub_456", metadata: { handwerkerId: "hw2" } } },
      lines: { data: [{ pricing: { price_details: { lookup_key: "team" } }, period: { start: 1786500000 } }] },
    });
    expect(neu.subscriptionId).toBe("sub_456");
    expect(neu.handwerkerId).toBe("hw2");
    expect(neu.tarif).toBe("TEAM");
    expect(neu.nettoEuro).toBe(199);
  });
});

describe("Stripe: Ereignis-Verarbeitung", () => {
  const checkoutEvent = {
    type: "checkout.session.completed",
    data: { object: {
      client_reference_id: "hw1", subscription: "sub_123", customer: "cus_9",
      amount_subtotal: 4900, metadata: {},
    } },
  };

  it("Checkout abgeschlossen → Abo AKTIV + AdminLog + WhatsApp an den Betreiber", async () => {
    const { p, aufrufe } = fakePrisma({ handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "M. Müller" } });
    const melde = vi.fn(async () => true);
    const erg = await verarbeiteStripeEvent(p, checkoutEvent, melde);
    expect(erg.aktion).toBe("abo-aktiv");
    const upsert = aufrufe.aboUpsert[0] as { update: Record<string, unknown> };
    expect(upsert.update.status).toBe("AKTIV");
    expect(upsert.update.tarif).toBe("BASIS"); // aus dem Netto-Preis 49 abgeleitet
    expect(upsert.update.stripeSubscriptionId).toBe("sub_123");
    expect(melde).toHaveBeenCalledWith("Maler Müller GmbH", "Basis", 49);
    expect(aufrufe.adminLogCreate).toHaveLength(1);
  });

  it("Checkout ohne bekannten Betrieb → ignoriert, keine WhatsApp", async () => {
    const { p, aufrufe } = fakePrisma({ handwerker: null });
    const melde = vi.fn(async () => true);
    const erg = await verarbeiteStripeEvent(p, checkoutEvent, melde);
    expect(erg.aktion).toBe("ignoriert");
    expect(aufrufe.aboUpsert).toHaveLength(0);
    expect(melde).not.toHaveBeenCalled();
  });

  const rechnungEvent = {
    type: "invoice.paid",
    data: { object: {
      id: "in_77", subscription: "sub_123", subtotal_excluding_tax: 4900,
      lines: { data: [{ price: { lookup_key: "basis" }, period: { start: 1786500000 } }] },
    } },
  };

  it("Rechnung bezahlt → NETTO-Buchung im richtigen Monat", async () => {
    const { p, aufrufe } = fakePrisma({
      abo: { handwerkerId: "hw1", stripeSubscriptionId: "sub_123" },
      handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "" },
    });
    const erg = await verarbeiteStripeEvent(p, rechnungEvent, vi.fn(async () => true));
    expect(erg.aktion).toBe("gebucht");
    const buchung = (aufrufe.buchungCreate[0] as { data: Record<string, unknown> }).data;
    expect(buchung.typ).toBe("ZAHLUNG");
    expect(buchung.betrag).toBe(49);
    expect(buchung.zeitraum).toBe("2026-08");
    expect(String(buchung.notiz)).toContain("in_77");
  });

  it("dieselbe Rechnung ein zweites Mal → keine Doppelbuchung (Idempotenz)", async () => {
    const { p, aufrufe } = fakePrisma({
      abo: { handwerkerId: "hw1", stripeSubscriptionId: "sub_123" },
      buchungVorhanden: { id: "b1" },
    });
    const erg = await verarbeiteStripeEvent(p, rechnungEvent, vi.fn(async () => true));
    expect(erg.aktion).toBe("schon-gebucht");
    expect(aufrufe.buchungCreate).toHaveLength(0);
  });

  it("Abo bei Stripe beendet → Status GEKUENDIGT", async () => {
    const { p, aufrufe } = fakePrisma({
      abo: { handwerkerId: "hw1", stripeSubscriptionId: "sub_123" },
      handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "" },
    });
    const erg = await verarbeiteStripeEvent(
      p,
      { type: "customer.subscription.deleted", data: { object: { id: "sub_123" } } },
      vi.fn(async () => true),
    );
    expect(erg.aktion).toBe("gekuendigt");
    const um = aufrufe.aboUpdateMany[0] as { data: Record<string, unknown> };
    expect(um.data.status).toBe("GEKUENDIGT");
    expect(aufrufe.adminLogCreate).toHaveLength(1);
  });

  // Original-Buchung, auf die sich die Erstattungen beziehen (Netto 99 €).
  const origBuchung = { handwerkerId: "hw1", betrieb: "Maler Müller GmbH", betrag: 99, zeitraum: "2026-08" };
  const erstattungsEvent = (erstattetCent: number) => ({
    type: "charge.refunded",
    data: { object: { invoice: "in_77", amount: 11781, amount_refunded: erstattetCent } },
  });

  it("Voll-Erstattung → negative KORREKTUR in voller Netto-Höhe", async () => {
    const { p, aufrufe } = fakePrisma({ buchungVorhanden: origBuchung });
    const erg = await verarbeiteStripeEvent(p, erstattungsEvent(11781), vi.fn(async () => true));
    expect(erg.aktion).toBe("erstattung-gebucht");
    const b = (aufrufe.buchungCreate[0] as { data: Record<string, unknown> }).data;
    expect(b.typ).toBe("KORREKTUR");
    expect(b.betrag).toBe(-99);
    expect(b.zeitraum).toBe("2026-08");
    expect(String(b.notiz)).toContain("in_77");
  });

  it("dieselbe Erstattung erneut zugestellt → keine Doppel-Korrektur", async () => {
    const { p, aufrufe } = fakePrisma({
      buchungVorhanden: origBuchung,
      korrekturen: [{ betrag: -99 }],
    });
    const erg = await verarbeiteStripeEvent(p, erstattungsEvent(11781), vi.fn(async () => true));
    expect(erg.aktion).toBe("schon-gebucht");
    expect(aufrufe.buchungCreate).toHaveLength(0);
  });

  it("Teil-Erstattung → anteilige Netto-Korrektur", async () => {
    const { p, aufrufe } = fakePrisma({ buchungVorhanden: origBuchung });
    // Hälfte des Brutto-Betrags erstattet → Hälfte des Netto-Betrags korrigieren
    const halb = { type: "charge.refunded", data: { object: { invoice: "in_77", amount: 10000, amount_refunded: 5000 } } };
    const erg = await verarbeiteStripeEvent(p, halb, vi.fn(async () => true));
    expect(erg.aktion).toBe("erstattung-gebucht");
    expect((aufrufe.buchungCreate[0] as { data: Record<string, unknown> }).data.betrag).toBe(-49.5);
  });

  it("unbekannter Ereignistyp → ignoriert, nichts passiert", async () => {
    const { p, aufrufe } = fakePrisma();
    const erg = await verarbeiteStripeEvent(p, { type: "product.created", data: { object: {} } }, vi.fn(async () => true));
    expect(erg.aktion).toBe("ignoriert");
    expect(aufrufe.aboUpsert).toHaveLength(0);
    expect(aufrufe.buchungCreate).toHaveLength(0);
  });
});
