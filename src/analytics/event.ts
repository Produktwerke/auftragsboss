// Minimales Event-Tracking für Produktmetriken (Aktivierung, Qualität, Bindung).
//
// Datensparsam: Wir speichern einen Ereignistyp, optional den Betriebsbezug und
// wenige strukturierte Zahlen als JSON. NIEMALS Kundennamen, Anschriften oder
// Freitexte. Grundlage fürs spätere interne Dashboard (siehe Briefing §21).
//
// Fehlertolerant: Ein fehlgeschlagenes Event darf NIE den eigentlichen Ablauf
// (Angebot erstellen) stören. Deshalb wird jeder Fehler nur geloggt, nicht
// weitergeworfen.
import type { PrismaClient } from "@prisma/client";

export interface EventOptionen {
  handwerkerId?: string | null;
  /** Wenige strukturierte Kennzahlen. Keine personenbezogenen Daten. */
  data?: Record<string, unknown>;
}

export async function spurEvent(
  prisma: PrismaClient,
  typ: string,
  opts: EventOptionen = {},
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        typ,
        handwerkerId: opts.handwerkerId ?? null,
        dataJson: JSON.stringify(opts.data ?? {}),
      },
    });
  } catch (err) {
    console.error(`Event "${typ}" konnte nicht gespeichert werden:`, err);
  }
}
