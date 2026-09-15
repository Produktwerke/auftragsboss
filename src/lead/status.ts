// Lead-Zustandsmodell (Etappe 2, 15.09.2026, nach dem Sales-Frank-Brief).
//
// Ein Lead (Handwerker mit leadQuelle TELEFON oder WEBSITE) durchläuft:
//
//   EINGELADEN → ZUGESTELLT → GELESEN → (ERKLAERT | WARTET_AUF_AUFTRAG) → AKTIV
//        └→ EINLADUNG_FEHLGESCHLAGEN (Nummer nicht bei WhatsApp o. ä.)
//
// Die ersten drei Übergänge kommen aus Metas Status-Callbacks (delivered/read/
// failed), die im selben Webhook wie die Nachrichten ankommen. Sie werden nur
// für Leads in frühen Zuständen ausgewertet: solange der Lead nichts geantwortet
// hat, ist unsere einzige Nachricht an ihn die Einladung, also ist jeder Status
// eindeutig ihr zuzuordnen. Sobald er reagiert (Knopf, Eingabe), übernehmen
// onboarding.ts und die Pipeline; spätere Status-Callbacks ändern nichts mehr.
import type { PrismaClient } from "@prisma/client";
import { spurEvent } from "../analytics/event.js";

export type MetaStatus = "sent" | "delivered" | "read" | "failed" | string;

export interface MetaStatusMeldung {
  id?: string;
  status?: MetaStatus;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/** Zustände, in denen ein Lead noch nicht reagiert hat (Status-Callbacks wirken). */
export const FRUEHE_ZUSTAENDE = new Set(["EINGELADEN", "ZUGESTELLT", "GELESEN"]);

/** Zustände, in denen eine Erinnerung sinnvoll ist (eingeladen, aber nichts eingesprochen). */
export const ERINNERBARE_ZUSTAENDE = new Set(["EINGELADEN", "ZUGESTELLT", "GELESEN", "ERKLAERT"]);

/**
 * Nächster Lead-Zustand aus einem Meta-Status. Rein, testbar. `null` = keine Änderung.
 * Reihenfolge ist monoton: „gelesen" fällt nie auf „zugestellt" zurück.
 */
export function naechsterZustand(aktuell: string | null, meta: MetaStatus | undefined): string | null {
  if (!aktuell || !FRUEHE_ZUSTAENDE.has(aktuell)) return null;
  if (meta === "delivered") return aktuell === "EINGELADEN" ? "ZUGESTELLT" : null;
  if (meta === "read") return aktuell === "GELESEN" ? null : "GELESEN";
  if (meta === "failed") return aktuell === "EINGELADEN" ? "EINLADUNG_FEHLGESCHLAGEN" : null;
  return null;
}

const EVENT_JE_ZUSTAND: Record<string, string> = {
  ZUGESTELLT: "LEAD_ZUGESTELLT",
  GELESEN: "LEAD_GELESEN",
  EINLADUNG_FEHLGESCHLAGEN: "LEAD_EINLADUNG_FEHLGESCHLAGEN",
};

/**
 * Einen Meta-Status-Callback auf den Lead anwenden. Gibt den neuen Zustand
 * zurück (fürs Log) oder null, wenn nichts zu tun war (kein Lead, kein
 * relevanter Übergang). Fehlerfälle landen zusätzlich im Admin-Protokoll,
 * damit der Betreiber sieht, dass eine Einladung nie ankam.
 */
export async function verarbeiteNachrichtStatus(prisma: PrismaClient, meldung: MetaStatusMeldung): Promise<string | null> {
  const nummer = (meldung.recipient_id ?? "").replace(/\D/g, "");
  if (!nummer || !meldung.status) return null;
  const h = await prisma.handwerker.findUnique({
    where: { whatsappNummer: nummer },
    select: { id: true, leadQuelle: true, onboardingStatus: true, firma: true, name: true },
  });
  if (!h || !h.leadQuelle) return null;

  const neu = naechsterZustand(h.onboardingStatus, meldung.status);
  if (!neu) return null;

  // Nur setzen, wenn der Zustand inzwischen nicht weitergewandert ist (Race mit Knopfklick).
  const erg = await prisma.handwerker.updateMany({
    where: { id: h.id, onboardingStatus: h.onboardingStatus },
    data: { onboardingStatus: neu },
  });
  if (erg.count === 0) return null;

  const fehler = meldung.errors?.[0];
  await spurEvent(prisma, EVENT_JE_ZUSTAND[neu] ?? "LEAD_STATUS", {
    handwerkerId: h.id,
    data: neu === "EINLADUNG_FEHLGESCHLAGEN" ? { code: fehler?.code ?? null, titel: fehler?.title ?? null } : {},
  });
  if (neu === "EINLADUNG_FEHLGESCHLAGEN") {
    await prisma.adminLog.create({
      data: {
        aktion: "LEAD_EINLADUNG_FEHLGESCHLAGEN",
        handwerkerId: h.id,
        betrieb: h.firma || h.name || `+${nummer}`,
        detail: `WhatsApp-Einladung nicht zustellbar${fehler?.code ? ` (Meta ${fehler.code}${fehler.title ? `: ${fehler.title}` : ""})` : ""}`,
      },
    });
  }
  return neu;
}

/** Lesbare Bezeichnung für das Cockpit. */
export function zustandLabel(z: string | null): string {
  switch (z) {
    case "EINGELADEN": return "eingeladen";
    case "ZUGESTELLT": return "zugestellt";
    case "GELESEN": return "gelesen";
    case "ERKLAERT": return "Erklärung angesehen";
    case "WARTET_AUF_AUFTRAG": return "hat Ja geklickt";
    case "AKTIV": return "aktiv";
    case "EINLADUNG_FEHLGESCHLAGEN": return "Einladung nicht zustellbar";
    default: return z ?? "–";
  }
}

/** Lesbare Bezeichnung der Leadquelle. */
export function quelleLabel(q: string | null): string {
  switch (q) {
    case "TELEFON": return "Telefon";
    case "WEBSITE": return "Website";
    case null: return "Direkt (WhatsApp)";
    default: return q;
  }
}
