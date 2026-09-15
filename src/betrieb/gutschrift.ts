// Gutschriften für Betriebe (15.09.2026, Dirks Entscheidung zum Empfehlungs-
// programm): Statt „beide 1 Monat gratis" bekommt der WERBER 100 € auf seine
// kommenden Abrechnungen gutgeschrieben, sobald der geworbene Kollege Kunde wird.
//
// Zwei Wege, je nachdem, wie der Betrieb zahlt:
//   • Stripe-Kunde: Guthaben direkt beim Stripe-Kunden (customer balance). Stripe
//     verrechnet es automatisch mit den nächsten Rechnungen. Im Ledger steht eine
//     negative GUTSCHRIFT-Zeile, weil das Geld nie bei uns ankommt (Umsatz = Ist).
//   • Manuell zahlender Betrieb oder noch ohne Abo: Konto-Guthaben am Betrieb
//     (Handwerker.guthabenEuro). Der Betreiber verrechnet es bei der nächsten
//     manuellen Zahlung (Cockpit „Guthaben verrechnen"), dann entsteht die
//     Ledger-Zeile. Bucht der Betrieb später online, wandert das Guthaben nach Stripe.
import type { PrismaClient } from "@prisma/client";
import { monatsZeitraum } from "./abrechnung.js";
import { EMPFEHLUNGS_PRAEMIE_EUR } from "../empfehlung.js";
import { normalisiereHandy } from "../config.js";

/** Schreibt Guthaben beim Stripe-Kunden gut (injizierbar für Tests). */
export type StripeGutschreiber = (stripeCustomerId: string, euro: number, beschreibung: string) => Promise<void>;

type BetriebKurz = { id: string; firma: string; name: string; whatsappNummer: string; guthabenEuro: number };

const rund2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Gutschrift auf kommende Abrechnungen. Liefert den Weg zurück, damit der
 * Betreiber sieht, ob Stripe das automatisch verrechnet oder er selbst dran ist.
 */
export async function schreibeGut(
  prisma: PrismaClient,
  betrieb: BetriebKurz,
  euro: number,
  grund: string,
  stripeGutschreiben: StripeGutschreiber | null,
): Promise<{ weg: "stripe" | "konto" }> {
  const betrag = rund2(euro);
  if (!(betrag > 0)) throw new Error("Gutschrift muss größer als 0 sein");
  const name = betrieb.firma || betrieb.name;
  const abo = await prisma.abo.findUnique({ where: { handwerkerId: betrieb.id } });
  if (abo?.stripeCustomerId && stripeGutschreiben) {
    await stripeGutschreiben(abo.stripeCustomerId, betrag, grund);
    await prisma.buchung.create({
      data: { handwerkerId: betrieb.id, betrieb: name, typ: "GUTSCHRIFT", betrag: -betrag, zeitraum: monatsZeitraum(), notiz: `Gutschrift in Stripe: ${grund}` },
    });
    await prisma.adminLog.create({
      data: { aktion: "GUTSCHRIFT", handwerkerId: betrieb.id, betrieb: name, detail: `${betrag} € auf die kommenden Stripe-Rechnungen: ${grund}` },
    });
    return { weg: "stripe" };
  }
  await prisma.handwerker.update({ where: { id: betrieb.id }, data: { guthabenEuro: { increment: betrag } } });
  await prisma.adminLog.create({
    data: { aktion: "GUTSCHRIFT", handwerkerId: betrieb.id, betrieb: name, detail: `${betrag} € Konto-Guthaben (bei der nächsten Zahlung verrechnen): ${grund}` },
  });
  return { weg: "konto" };
}

/**
 * Konto-Guthaben mit einer manuellen Zahlung verrechnen: Guthaben runter und
 * negative GUTSCHRIFT-Zeile im Ledger. Atomar, damit ein Doppelklick nichts
 * doppelt verrechnet. false = nicht genug Guthaben.
 */
export async function verrechneGuthaben(
  prisma: PrismaClient,
  betrieb: BetriebKurz,
  euro: number,
  zeitraum: string,
): Promise<boolean> {
  const betrag = rund2(euro);
  if (!(betrag > 0)) return false;
  const name = betrieb.firma || betrieb.name;
  return prisma.$transaction(async (tx) => {
    const abgezogen = await tx.handwerker.updateMany({
      where: { id: betrieb.id, guthabenEuro: { gte: betrag } },
      data: { guthabenEuro: { decrement: betrag } },
    });
    if (abgezogen.count === 0) return false;
    await tx.buchung.create({
      data: { handwerkerId: betrieb.id, betrieb: name, typ: "GUTSCHRIFT", betrag: -betrag, zeitraum, notiz: "Guthaben mit Zahlung verrechnet" },
    });
    return true;
  });
}

/**
 * Empfehlung aktivieren: der geworbene Kollege ist Kunde geworden, der Werber
 * bekommt die Prämie. Idempotent über den Status (OFFEN → AKTIVIERT genau einmal).
 */
export async function aktiviereEmpfehlung(
  prisma: PrismaClient,
  empfehlungId: string,
  stripeGutschreiben: StripeGutschreiber | null,
): Promise<{ ok: boolean; weg?: "stripe" | "konto"; werber?: string; firma?: string }> {
  const umgestellt = await prisma.empfehlung.updateMany({
    where: { id: empfehlungId, status: "OFFEN" },
    data: { status: "AKTIVIERT" },
  });
  if (umgestellt.count === 0) return { ok: false };
  const e = await prisma.empfehlung.findUnique({ where: { id: empfehlungId } });
  if (!e) return { ok: false };
  const werber = await prisma.handwerker.findUnique({ where: { id: e.werberId } });
  if (!werber) return { ok: false };
  const { weg } = await schreibeGut(prisma, werber, EMPFEHLUNGS_PRAEMIE_EUR, `Empfehlung ${e.firma} (${e.name})`, stripeGutschreiben);
  return { ok: true, weg, werber: werber.firma || werber.name, firma: e.firma };
}

/**
 * Nach einem Stripe-Abo-Abschluss (Webhook): (1) Konto-Guthaben des Betriebs
 * nach Stripe übertragen, (2) eine offene Empfehlung auf diese Nummer aktivieren,
 * damit der Werber seine Prämie automatisch bekommt. Fehler hier dürfen den
 * Abo-Abschluss nie kaputt machen, deshalb je Schritt abgefangen.
 */
export async function nachAboAbschluss(
  prisma: PrismaClient,
  betrieb: BetriebKurz,
  stripeCustomerId: string | null,
  stripeGutschreiben: StripeGutschreiber | null,
): Promise<{ uebertragen: number; empfehlungAktiviert: boolean }> {
  const ergebnis = { uebertragen: 0, empfehlungAktiviert: false };
  const name = betrieb.firma || betrieb.name;
  try {
    if (stripeCustomerId && stripeGutschreiben && betrieb.guthabenEuro > 0) {
      const betrag = rund2(betrieb.guthabenEuro);
      const genullt = await prisma.handwerker.updateMany({ where: { id: betrieb.id, guthabenEuro: betrag }, data: { guthabenEuro: 0 } });
      if (genullt.count > 0) {
        await stripeGutschreiben(stripeCustomerId, betrag, "Übertrag Konto-Guthaben");
        await prisma.buchung.create({
          data: { handwerkerId: betrieb.id, betrieb: name, typ: "GUTSCHRIFT", betrag: -betrag, zeitraum: monatsZeitraum(), notiz: "Konto-Guthaben nach Stripe übertragen" },
        });
        await prisma.adminLog.create({
          data: { aktion: "GUTHABEN_UEBERTRAGEN", handwerkerId: betrieb.id, betrieb: name, detail: `${betrag} € Konto-Guthaben nach Stripe übertragen` },
        });
        ergebnis.uebertragen = betrag;
      }
    }
  } catch (err) {
    console.error("Guthaben-Übertrag nach Stripe fehlgeschlagen:", err instanceof Error ? err.message : err);
  }
  try {
    const nummer = normalisiereHandy(betrieb.whatsappNummer);
    const offene = await prisma.empfehlung.findMany({ where: { status: "OFFEN" } });
    const treffer = offene.find((e) => nummer && normalisiereHandy(e.whatsappNummer) === nummer);
    if (treffer) {
      const a = await aktiviereEmpfehlung(prisma, treffer.id, stripeGutschreiben);
      ergebnis.empfehlungAktiviert = a.ok;
    }
  } catch (err) {
    console.error("Empfehlung nach Abo-Abschluss nicht aktiviert:", err instanceof Error ? err.message : err);
  }
  return ergebnis;
}
