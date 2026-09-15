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
    empfehlung: { findMany: vi.fn(async () => []) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}

describe("Stripe: pure Ausleser", () => {
  it("tarifAusLookup und tarifAusPreis und tarifLabel", () => {
    expect(tarifAusLookup("basis")).toBe("BASIS");
    expect(tarifAusLookup("Team")).toBe("TEAM");
    expect(tarifAusLookup("fremd")).toBeNull();
    expect(tarifAusPreis(79)).toBe("PROFI");
    expect(tarifAusPreis(99)).toBe("INDIVIDUELL"); // alter Preis — kein Preset mehr
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
      amount_subtotal: 2900,
      metadata: { tarif: "BASIS" },
    });
    expect(s).toEqual({
      handwerkerId: "hw1", subscriptionId: "sub_123", customerId: "cus_9",
      tarif: "BASIS", nettoEuro: 29,
    });
  });

  it("liesRechnung: klassische UND neue API-Form", () => {
    const klassisch = liesRechnung({
      id: "in_1", subscription: "sub_123", subtotal_excluding_tax: 7900,
      lines: { data: [{ price: { lookup_key: "profi" }, period: { start: 1786500000 } }] },
    });
    expect(klassisch.invoiceId).toBe("in_1");
    expect(klassisch.subscriptionId).toBe("sub_123");
    expect(klassisch.tarif).toBe("PROFI");
    expect(klassisch.nettoEuro).toBe(79);
    expect(klassisch.zeitraum).toBe("2026-08"); // 1786500000 = 12.08.2026

    const neu = liesRechnung({
      id: "in_2", total_excluding_tax: 14900,
      parent: { subscription_details: { subscription: "sub_456", metadata: { handwerkerId: "hw2" } } },
      lines: { data: [{ pricing: { price_details: { lookup_key: "team" } }, period: { start: 1786500000 } }] },
    });
    expect(neu.subscriptionId).toBe("sub_456");
    expect(neu.handwerkerId).toBe("hw2");
    expect(neu.tarif).toBe("TEAM");
    expect(neu.nettoEuro).toBe(149);
  });
});

describe("Stripe: Ereignis-Verarbeitung", () => {
  const checkoutEvent = {
    type: "checkout.session.completed",
    data: { object: {
      client_reference_id: "hw1", subscription: "sub_123", customer: "cus_9",
      amount_subtotal: 2900, metadata: {},
    } },
  };

  it("Checkout abgeschlossen → Abo AKTIV + AdminLog + WhatsApp an den Betreiber", async () => {
    const { p, aufrufe } = fakePrisma({ handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "M. Müller" } });
    const melde = vi.fn(async () => true);
    const erg = await verarbeiteStripeEvent(p, checkoutEvent, melde);
    expect(erg.aktion).toBe("abo-aktiv");
    const upsert = aufrufe.aboUpsert[0] as { update: Record<string, unknown> };
    expect(upsert.update.status).toBe("AKTIV");
    expect(upsert.update.tarif).toBe("BASIS"); // aus dem Netto-Preis 29 abgeleitet
    expect(upsert.update.stripeSubscriptionId).toBe("sub_123");
    expect(melde).toHaveBeenCalledWith("Maler Müller GmbH", "Basis", 29);
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
      id: "in_77", subscription: "sub_123", subtotal_excluding_tax: 2900,
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
    expect(buchung.betrag).toBe(29);
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

  it("Kundenportal: vorgemerkte Kündigung und Rücknahme landen im Admin-Protokoll, andere Abo-Änderungen nicht", async () => {
    const abo = { handwerkerId: "hw1", stripeSubscriptionId: "sub_123" };
    const { p, aufrufe } = fakePrisma({ abo, handwerker: { firma: "Maler Müller GmbH", name: "Müller" } });
    const vorgemerkt = await verarbeiteStripeEvent(
      p,
      { type: "customer.subscription.updated", data: { object: { id: "sub_123", cancel_at_period_end: true, cancel_at: 1760400000 }, previous_attributes: { cancel_at_period_end: false } } },
      vi.fn(async () => true),
    );
    expect(vorgemerkt.aktion).toBe("kuendigung-vorgemerkt");
    const zurueck = await verarbeiteStripeEvent(
      p,
      { type: "customer.subscription.updated", data: { object: { id: "sub_123", cancel_at_period_end: false, cancel_at: null }, previous_attributes: { cancel_at_period_end: true } } },
      vi.fn(async () => true),
    );
    expect(zurueck.aktion).toBe("kuendigung-zurueckgenommen");
    const sonstige = await verarbeiteStripeEvent(
      p,
      { type: "customer.subscription.updated", data: { object: { id: "sub_123", cancel_at_period_end: false }, previous_attributes: { metadata: {} } } },
      vi.fn(async () => true),
    );
    expect(sonstige.aktion).toBe("ignoriert");
    expect(aufrufe.adminLogCreate).toHaveLength(2);
    const erste = aufrufe.adminLogCreate[0] as { data: { aktion: string; detail: string } };
    expect(erste.data.aktion).toBe("STRIPE_KUENDIGUNG_VORGEMERKT");
    expect(erste.data.detail).toContain("Kundenportal");
  });

  it("Zahlungsausfall: markiert das Abo, ruft den Hook, und invoice.paid hebt es wieder auf", async () => {
    const abo = { handwerkerId: "hw1", stripeSubscriptionId: "sub_123", zahlungOffenSeit: null, zahlungFehlversuche: 0 };
    const { p, aufrufe } = fakePrisma({ abo, handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "Müller", email: "m@x.de" } });
    const hooks = { fehlgeschlagen: vi.fn(async () => {}), nachgeholt: vi.fn(async () => {}), aboBeendet: vi.fn(async () => {}) };
    const erg = await verarbeiteStripeEvent(
      p,
      { type: "invoice.payment_failed", data: { object: { id: "in_9", subscription: "sub_123", hosted_invoice_url: "https://stripe.test/in_9", amount_due: 9401 } } },
      vi.fn(async () => true),
      undefined,
      hooks,
    );
    expect(erg.aktion).toBe("zahlung-fehlgeschlagen");
    expect(erg.detail).toContain("Versuch 1");
    const um = aufrufe.aboUpdateMany[0] as { data: Record<string, unknown> };
    expect(um.data.zahlungFehlversuche).toBe(1);
    expect(um.data.zahlungOffeneRechnung).toBe("https://stripe.test/in_9");
    expect(um.data.zahlungOffenSeit).toBeInstanceOf(Date);
    expect(hooks.fehlgeschlagen).toHaveBeenCalledTimes(1);
    expect((hooks.fehlgeschlagen.mock.calls[0] as unknown[])[2]).toEqual({ versuch: 1, rechnungUrl: "https://stripe.test/in_9", bruttoEuro: 94.01 });

    // Nachgeholt: invoice.paid mit offener Zahlung setzt zurück und entwarnt
    const offen = { ...abo, zahlungOffenSeit: new Date(), zahlungFehlversuche: 2 };
    const zweite = fakePrisma({ abo: offen, handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "Müller", email: "m@x.de" } });
    const bezahlt = await verarbeiteStripeEvent(
      zweite.p,
      { type: "invoice.paid", data: { object: { id: "in_10", subscription: "sub_123", total_excluding_tax: 7900, lines: { data: [{ period: { start: 1759276800 }, price: { lookup_key: "profi" } }] } } } },
      vi.fn(async () => true),
      undefined,
      hooks,
    );
    expect(bezahlt.aktion).toBe("gebucht");
    const reset = zweite.aufrufe.aboUpdateMany[0] as { data: Record<string, unknown> };
    expect(reset.data.zahlungOffenSeit).toBeNull();
    expect(reset.data.zahlungFehlversuche).toBe(0);
    expect(hooks.nachgeholt).toHaveBeenCalledTimes(1);
  });

  it("Abo-Ende nach Zahlungsausfall wird als solches vermerkt und gemeldet", async () => {
    const abo = { handwerkerId: "hw1", stripeSubscriptionId: "sub_123", zahlungOffenSeit: new Date(), zahlungFehlversuche: 4 };
    const { p, aufrufe } = fakePrisma({ abo, handwerker: { id: "hw1", firma: "Maler Müller GmbH", name: "Müller", email: "" } });
    const hooks = { fehlgeschlagen: vi.fn(async () => {}), nachgeholt: vi.fn(async () => {}), aboBeendet: vi.fn(async () => {}) };
    const erg = await verarbeiteStripeEvent(p, { type: "customer.subscription.deleted", data: { object: { id: "sub_123" } } }, vi.fn(async () => true), undefined, hooks);
    expect(erg.detail).toContain("Zahlungsausfall");
    expect((aufrufe.adminLogCreate[0] as { data: { detail: string } }).data.detail).toContain("4 fehlgeschlagenen Einzügen");
    expect(hooks.aboBeendet).toHaveBeenCalledTimes(1);
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

  it("Erstattung ohne invoice-Feld (API 2026) → Rechnung über den PaymentIntent gefunden", async () => {
    const { p, aufrufe } = fakePrisma({ buchungVorhanden: origBuchung });
    const ohneInvoice = { type: "charge.refunded", data: { object: { payment_intent: "pi_1", amount: 11781, amount_refunded: 11781 } } };
    const suche = vi.fn(async (pi: string) => (pi === "pi_1" ? "in_77" : null));
    const erg = await verarbeiteStripeEvent(p, ohneInvoice, vi.fn(async () => true), undefined, undefined, suche);
    expect(erg.aktion).toBe("erstattung-gebucht");
    expect(suche).toHaveBeenCalledWith("pi_1");
    expect((aufrufe.buchungCreate[0] as { data: Record<string, unknown> }).data.betrag).toBe(-99);
  });

  it("unbekannter Ereignistyp → ignoriert, nichts passiert", async () => {
    const { p, aufrufe } = fakePrisma();
    const erg = await verarbeiteStripeEvent(p, { type: "product.created", data: { object: {} } }, vi.fn(async () => true));
    expect(erg.aktion).toBe("ignoriert");
    expect(aufrufe.aboUpsert).toHaveLength(0);
    expect(aufrufe.buchungCreate).toHaveLength(0);
  });
});
