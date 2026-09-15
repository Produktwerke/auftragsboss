// Verarbeitet Stripe-Webhook-Ereignisse und übersetzt sie in unser
// Abrechnungs-Modell: Abo (Soll-Zustand) + Buchungs-Ledger (Ist-Einnahmen).
//
// Grundsätze:
//  • Die Buchung entsteht bei `invoice.paid` (deckt Erstzahlung UND jeden
//    Folgemonat ab) — idempotent über die Stripe-Rechnungsnummer in der Notiz,
//    Stripe darf denselben Webhook also mehrfach zustellen.
//  • `checkout.session.completed` setzt das Abo auf AKTIV und schickt die
//    "neuer Kunde"-WhatsApp an den Betreiber.
//  • `customer.subscription.deleted` kündigt das Abo.
//  • Alles Unbekannte wird bewusst ignoriert (ok zurück an Stripe, kein Retry).
//
// Feld-Zugriffe auf die Stripe-Objekte sind absichtlich TOLERANT gehalten
// (alte und neue API-Formen), damit ein Stripe-Versionswechsel nicht sofort
// Buchungen verliert — fehlt etwas Wichtiges, wird das Ereignis mit Log
// übersprungen statt falsch gebucht.
import type { PrismaClient } from "@prisma/client";
import { istTarif, monatsZeitraum, TARIF_PRESETS, type Tarif } from "./abrechnung.js";
import { meldeNeuenKunden } from "./betreiberAlarm.js";
import { nachAboAbschluss } from "./gutschrift.js";
import { stripeGutschreiben } from "./stripeCheckout.js";
import { stripeKonfiguriert } from "../config.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Preis-lookup_key aus dem Einrichtungs-Skript → Tarifname. */
export function tarifAusLookup(lookup: string | null | undefined): Tarif | null {
  switch ((lookup ?? "").toLowerCase()) {
    case "basis":
      return "BASIS";
    case "profi":
      return "PROFI";
    case "team":
      return "TEAM";
    default:
      return null;
  }
}

/** Sprechender Tarifname für die WhatsApp an den Betreiber. */
export function tarifLabel(tarif: Tarif): string {
  return tarif === "INDIVIDUELL" ? "Individuell" : tarif.charAt(0) + tarif.slice(1).toLowerCase();
}

/** String-Wert oder id aus einem Stripe-Feld, das mal String, mal Objekt ist. */
function idVon(wert: unknown): string | null {
  if (typeof wert === "string" && wert) return wert;
  if (wert && typeof wert === "object" && typeof (wert as any).id === "string") return (wert as any).id;
  return null;
}

/** Kerndaten aus einer Checkout-Session (Abo-Abschluss). */
export function liesCheckout(session: any): {
  handwerkerId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  tarif: Tarif | null;
  nettoEuro: number | null;
} {
  const meta = session?.metadata ?? {};
  const tarifMeta = typeof meta.tarif === "string" && istTarif(meta.tarif) ? (meta.tarif as Tarif) : null;
  return {
    handwerkerId: session?.client_reference_id ?? meta.handwerkerId ?? null,
    subscriptionId: idVon(session?.subscription),
    customerId: idVon(session?.customer),
    tarif: tarifMeta,
    // amount_subtotal = Cent VOR Steuer — passt zu unseren Netto-Preisen.
    nettoEuro: typeof session?.amount_subtotal === "number" ? session.amount_subtotal / 100 : null,
  };
}

/** Kerndaten aus einer bezahlten Rechnung (Erst- und Folgezahlungen). */
export function liesRechnung(inv: any): {
  invoiceId: string | null;
  subscriptionId: string | null;
  handwerkerId: string | null;
  tarif: Tarif | null;
  nettoEuro: number | null;
  zeitraum: string;
} {
  // Abo-Bezug: neue API-Form (invoice.parent.subscription_details) zuerst,
  // dann die klassischen Felder.
  const subDetails = inv?.parent?.subscription_details ?? inv?.subscription_details ?? null;
  const subscriptionId = idVon(subDetails?.subscription) ?? idVon(inv?.subscription);
  const meta = subDetails?.metadata ?? {};
  const handwerkerId = typeof meta.handwerkerId === "string" && meta.handwerkerId ? meta.handwerkerId : null;

  // Tarif über den Preis-lookup_key der ersten Rechnungszeile (beide API-Formen).
  const zeile = inv?.lines?.data?.[0] ?? null;
  const lookup = zeile?.price?.lookup_key ?? zeile?.pricing?.price_details?.lookup_key ?? null;
  const tarifMeta = typeof meta.tarif === "string" && istTarif(meta.tarif) ? (meta.tarif as Tarif) : null;

  // Netto-Betrag: bevorzugt das ausgewiesene "ohne Steuer"-Feld.
  const nettoCent =
    inv?.total_excluding_tax ?? inv?.subtotal_excluding_tax ?? inv?.subtotal ?? null;

  // Abgedeckter Monat: Beginn des Abrechnungszeitraums der ersten Zeile.
  const periodenStart = zeile?.period?.start ?? inv?.period_start ?? inv?.created ?? null;
  const zeitraum = monatsZeitraum(
    typeof periodenStart === "number" ? new Date(periodenStart * 1000) : new Date(),
  );

  return {
    invoiceId: typeof inv?.id === "string" ? inv.id : null,
    subscriptionId,
    handwerkerId,
    tarif: tarifAusLookup(lookup) ?? tarifMeta,
    nettoEuro: typeof nettoCent === "number" ? nettoCent / 100 : null,
    zeitraum,
  };
}

/** Tarif bestimmen, wenn er nicht direkt mitkommt: über den Netto-Preis. */
export function tarifAusPreis(nettoEuro: number | null): Tarif {
  if (nettoEuro != null) {
    for (const [tarif, preis] of Object.entries(TARIF_PRESETS)) {
      if (Math.abs(preis - nettoEuro) < 0.005) return tarif as Tarif;
    }
  }
  return "INDIVIDUELL";
}

export type StripeErgebnis = { aktion: string; detail?: string };

/**
 * Ein Stripe-Ereignis verarbeiten. `melde` ist injizierbar (Tests); Standard
 * ist die echte Betreiber-WhatsApp.
 */
export async function verarbeiteStripeEvent(
  prisma: PrismaClient,
  event: { type: string; data: { object: any; previous_attributes?: any } },
  melde: typeof meldeNeuenKunden = meldeNeuenKunden,
  /** Nach dem Abo-Abschluss: Konto-Guthaben nach Stripe, offene Empfehlung aktivieren (injizierbar). */
  nachCheckout: typeof nachAboAbschluss = (p, hw, cus, g) => nachAboAbschluss(p, hw, cus, g ?? (stripeKonfiguriert() ? stripeGutschreiben : null)),
): Promise<StripeErgebnis> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = liesCheckout(event.data.object);
      if (!s.handwerkerId || !s.subscriptionId) {
        return { aktion: "ignoriert", detail: "Checkout ohne Betriebszuordnung/Abo" };
      }
      const hw = await prisma.handwerker.findUnique({ where: { id: s.handwerkerId } });
      if (!hw) return { aktion: "ignoriert", detail: `Unbekannter Betrieb ${s.handwerkerId}` };

      const tarif = s.tarif ?? tarifAusPreis(s.nettoEuro);
      const monatspreis = s.nettoEuro ?? TARIF_PRESETS[tarif] ?? 0;
      await prisma.abo.upsert({
        where: { handwerkerId: hw.id },
        update: {
          tarif,
          monatspreis,
          status: "AKTIV",
          gekuendigtAm: null,
          stripeCustomerId: s.customerId,
          stripeSubscriptionId: s.subscriptionId,
        },
        create: {
          handwerkerId: hw.id,
          tarif,
          monatspreis,
          status: "AKTIV",
          stripeCustomerId: s.customerId,
          stripeSubscriptionId: s.subscriptionId,
        },
      });
      await prisma.adminLog.create({
        data: {
          aktion: "STRIPE_ABO_GEBUCHT",
          handwerkerId: hw.id,
          betrieb: hw.firma || hw.name,
          detail: `${tarif} für ${monatspreis} €/Monat (netto), Abo ${s.subscriptionId}`,
        },
      });
      // Die WhatsApp an den Betreiber — Fehler hier sind egal, die Buchung zählt.
      await melde(hw.firma || hw.name, tarifLabel(tarif), monatspreis);
      // Empfehlungsprogramm: Konto-Guthaben des neuen Kunden nach Stripe übertragen
      // und eine offene Empfehlung auf seine Nummer aktivieren (Prämie an den Werber).
      const praemie = await nachCheckout(prisma, hw, s.customerId, null);
      return {
        aktion: "abo-aktiv",
        detail: `${s.subscriptionId}${praemie.empfehlungAktiviert ? ", Empfehlung aktiviert" : ""}${praemie.uebertragen ? `, ${praemie.uebertragen} € Guthaben übertragen` : ""}`,
      };
    }

    case "invoice.paid": {
      const r = liesRechnung(event.data.object);
      if (!r.invoiceId || !r.subscriptionId) {
        return { aktion: "ignoriert", detail: "Rechnung ohne Abo-Bezug" };
      }
      if (r.nettoEuro == null || r.nettoEuro <= 0) {
        return { aktion: "ignoriert", detail: `Rechnung ${r.invoiceId} ohne positiven Betrag` };
      }
      // Betrieb finden: über das (per checkout angelegte) Abo, sonst Metadaten.
      const abo = await prisma.abo.findFirst({
        where: { stripeSubscriptionId: r.subscriptionId },
      });
      const handwerkerId = abo?.handwerkerId ?? r.handwerkerId;
      if (!handwerkerId) {
        console.error(`Stripe: Rechnung ${r.invoiceId} keinem Betrieb zuzuordnen (Abo ${r.subscriptionId}).`);
        return { aktion: "ignoriert", detail: `Rechnung ${r.invoiceId} ohne Betrieb` };
      }
      // Idempotenz: dieselbe Stripe-Rechnung nie doppelt buchen. Anker ist
      // das eigene Unique-Feld stripeInvoiceId (Audit AB-M04) — die frühere
      // Textsuche in der Notiz konnte durch eine manuelle Notiz mit derselben
      // Rechnungs-Id oder eine VOR der Zahlung eintreffende Erstattungs-
      // Korrektur fälschlich anspringen (stiller Umsatzverlust im Ledger).
      // Der notiz-Vergleich bleibt NUR für Altbestände (vor diesem Feld),
      // eingeschränkt auf typ ZAHLUNG.
      const schonDa = await prisma.buchung.findFirst({
        where: {
          OR: [
            { stripeInvoiceId: r.invoiceId },
            { typ: "ZAHLUNG", notiz: { contains: r.invoiceId } },
          ],
        },
      });
      if (schonDa) return { aktion: "schon-gebucht", detail: r.invoiceId };

      const hw = await prisma.handwerker.findUnique({ where: { id: handwerkerId } });
      try {
        await prisma.buchung.create({
          data: {
            handwerkerId,
            betrieb: hw ? hw.firma || hw.name : "(unbekannt)",
            typ: "ZAHLUNG",
            betrag: r.nettoEuro,
            zeitraum: r.zeitraum,
            notiz: `Stripe-Rechnung ${r.invoiceId}`,
            stripeInvoiceId: r.invoiceId,
          },
        });
      } catch (err) {
        // Unique-Verletzung = zwei Zustellungen zeitgleich: die andere hat
        // gewonnen, diese hier ist damit erledigt.
        if ((err as { code?: string }).code === "P2002") {
          return { aktion: "schon-gebucht", detail: r.invoiceId };
        }
        throw err;
      }
      return { aktion: "gebucht", detail: `${r.invoiceId} → ${r.zeitraum}` };
    }

    case "customer.subscription.updated": {
      // Kundenportal (Etappe 3): Kündigung zum Periodenende vorgemerkt oder
      // zurückgenommen. Nur reagieren, wenn sich genau dieses Feld geändert hat
      // (previous_attributes), sonst kämen bei jeder Abo-Änderung Protokollzeilen.
      const sub = event.data.object;
      const vorher = event.data.previous_attributes;
      if (!vorher || typeof vorher.cancel_at_period_end !== "boolean") {
        return { aktion: "ignoriert", detail: "Abo-Änderung ohne Kündigungsbezug" };
      }
      const subId = idVon(sub) ?? idVon(sub?.id);
      const abo = subId ? await prisma.abo.findFirst({ where: { stripeSubscriptionId: subId } }) : null;
      if (!abo) return { aktion: "ignoriert", detail: `Kein Abo zu ${subId ?? "?"}` };
      const hw = await prisma.handwerker.findUnique({ where: { id: abo.handwerkerId } });
      const vorgemerkt = sub.cancel_at_period_end === true;
      const ende = typeof sub.cancel_at === "number" ? new Date(sub.cancel_at * 1000).toLocaleDateString("de-DE") : "Periodenende";
      await prisma.adminLog.create({
        data: {
          aktion: vorgemerkt ? "STRIPE_KUENDIGUNG_VORGEMERKT" : "STRIPE_KUENDIGUNG_ZURUECKGENOMMEN",
          handwerkerId: abo.handwerkerId,
          betrieb: hw ? hw.firma || hw.name : "(unbekannt)",
          detail: vorgemerkt ? `Kündigung über das Kundenportal zum ${ende}` : "Kündigung über das Kundenportal zurückgenommen",
        },
      });
      return { aktion: vorgemerkt ? "kuendigung-vorgemerkt" : "kuendigung-zurueckgenommen", detail: subId ?? undefined };
    }

    case "customer.subscription.deleted": {
      const subId = idVon(event.data.object) ?? idVon(event.data.object?.id);
      if (!subId) return { aktion: "ignoriert", detail: "Kündigung ohne Abo-Id" };
      const abo = await prisma.abo.findFirst({ where: { stripeSubscriptionId: subId } });
      if (!abo) return { aktion: "ignoriert", detail: `Kein Abo zu ${subId}` };
      await prisma.abo.updateMany({
        where: { stripeSubscriptionId: subId, status: "AKTIV" },
        data: { status: "GEKUENDIGT", gekuendigtAm: new Date() },
      });
      const hw = await prisma.handwerker.findUnique({ where: { id: abo.handwerkerId } });
      await prisma.adminLog.create({
        data: {
          aktion: "STRIPE_ABO_GEKUENDIGT",
          handwerkerId: abo.handwerkerId,
          betrieb: hw ? hw.firma || hw.name : "(unbekannt)",
          detail: `Abo ${subId} über Stripe beendet`,
        },
      });
      return { aktion: "gekuendigt", detail: subId };
    }

    case "charge.refunded": {
      // Rückerstattung (voll oder teilweise) → negative KORREKTUR-Buchung,
      // damit Einnahmen/Umsatz im Cockpit wieder stimmen. Idempotent über den
      // ZIEL-Zustand: Summe aller Korrekturen zu dieser Rechnung soll dem
      // erstatteten Anteil entsprechen — mehrfache Zustellung bucht nur das Delta.
      const charge = event.data.object;
      const invoiceId = idVon(charge?.invoice);
      if (!invoiceId) return { aktion: "ignoriert", detail: "Erstattung ohne Rechnungsbezug" };
      const gesamt = typeof charge?.amount === "number" ? charge.amount : null;
      const erstattet = typeof charge?.amount_refunded === "number" ? charge.amount_refunded : null;
      if (!gesamt || erstattet == null || erstattet <= 0) {
        return { aktion: "ignoriert", detail: `Erstattung ${invoiceId} ohne Betrag` };
      }
      const orig = await prisma.buchung.findFirst({
        where: {
          typ: "ZAHLUNG",
          OR: [{ stripeInvoiceId: invoiceId }, { notiz: { contains: invoiceId } }],
        },
      });
      if (!orig) return { aktion: "ignoriert", detail: `Keine Buchung zu Rechnung ${invoiceId}` };

      // Erstatteter Anteil (brutto) auf unseren NETTO-Buchungsbetrag umgelegt.
      const quote = Math.min(1, erstattet / gesamt);
      const soll = -Math.round(orig.betrag * quote * 100) / 100;
      const korrekturen = await prisma.buchung.findMany({
        where: { typ: "KORREKTUR", notiz: { contains: invoiceId } },
      });
      const bisher = Math.round(korrekturen.reduce((s, b) => s + b.betrag, 0) * 100) / 100;
      const delta = Math.round((soll - bisher) * 100) / 100;
      if (Math.abs(delta) < 0.005) return { aktion: "schon-gebucht", detail: `Erstattung ${invoiceId}` };

      await prisma.buchung.create({
        data: {
          handwerkerId: orig.handwerkerId,
          betrieb: orig.betrieb,
          typ: "KORREKTUR",
          betrag: delta,
          zeitraum: orig.zeitraum,
          notiz: `Stripe-Erstattung zur Rechnung ${invoiceId}`,
        },
      });
      return { aktion: "erstattung-gebucht", detail: `${invoiceId}: ${delta} €` };
    }

    case "invoice.payment_failed": {
      const r = liesRechnung(event.data.object);
      const abo = r.subscriptionId
        ? await prisma.abo.findFirst({ where: { stripeSubscriptionId: r.subscriptionId } })
        : null;
      if (abo) {
        const hw = await prisma.handwerker.findUnique({ where: { id: abo.handwerkerId } });
        await prisma.adminLog.create({
          data: {
            aktion: "STRIPE_ZAHLUNG_FEHLGESCHLAGEN",
            handwerkerId: abo.handwerkerId,
            betrieb: hw ? hw.firma || hw.name : "(unbekannt)",
            detail: `Rechnung ${r.invoiceId ?? "?"} — Stripe versucht es automatisch erneut`,
          },
        });
      }
      return { aktion: "zahlung-fehlgeschlagen", detail: r.invoiceId ?? undefined };
    }

    default:
      return { aktion: "ignoriert", detail: event.type };
  }
}
