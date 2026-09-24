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

/** Admin-Protokoll-Aktion für jede von Meta abgewiesene Nachricht an einen bekannten Betrieb. */
export const AKTION_NICHT_ZUSTELLBAR = "WHATSAPP_NICHT_ZUSTELLBAR";

/** Lesbare Erklärung der häufigsten Meta-Fehlercodes (für Admin-Protokoll und Warnsignal). */
export function metaFehlerText(code: number | null | undefined, titel?: string | null): string {
  switch (code) {
    case 131047: return "Meta 131047: freie Antwort außerhalb des 24-Stunden-Fensters abgewiesen, der Betrieb hat nichts erhalten";
    case 131026: return "Meta 131026: Nummer nicht bei WhatsApp erreichbar";
    case 131049: return "Meta 131049: Meta hat die Nachricht wegen Nutzer-Limits zurückgehalten";
    case 130472: return "Meta 130472: Nummer nimmt gerade keine Marketing-Nachrichten an";
    default: return code ? `Meta ${code}${titel ? `: ${titel}` : ""}` : "Meta-Fehler ohne Code";
  }
}

/**
 * Einen Meta-Status-Callback anwenden. Für Leads treibt er das Zustandsmodell
 * (Rückgabe = neuer Zustand, sonst null). Seit 24.09.2026 landet außerdem JEDE
 * abgewiesene Nachricht („failed") an einen bekannten Betrieb im Admin-Protokoll
 * und als Event, egal in welchem Zustand: vorher war z. B. eine gescheiterte
 * Antwort auf einen Knopfdruck nirgends sichtbar (Malerbetrieb Schwarz, 131047).
 */
export async function verarbeiteNachrichtStatus(prisma: PrismaClient, meldung: MetaStatusMeldung): Promise<string | null> {
  const nummer = (meldung.recipient_id ?? "").replace(/\D/g, "");
  if (!nummer || !meldung.status) return null;
  const h = await prisma.handwerker.findUnique({
    where: { whatsappNummer: nummer },
    select: { id: true, leadQuelle: true, onboardingStatus: true, firma: true, name: true },
  });
  if (!h) return null;

  const neu = h.leadQuelle ? naechsterZustand(h.onboardingStatus, meldung.status) : null;
  if (meldung.status === "failed" && neu !== "EINLADUNG_FEHLGESCHLAGEN") {
    // Kein Zustandswechsel (oder kein Lead), aber Meta hat eine Nachricht abgewiesen: sichtbar machen.
    const fehler = meldung.errors?.[0];
    await spurEvent(prisma, "NACHRICHT_FEHLGESCHLAGEN", { handwerkerId: h.id, data: { code: fehler?.code ?? null, zustand: h.onboardingStatus ?? null } });
    await prisma.adminLog.create({
      data: {
        aktion: AKTION_NICHT_ZUSTELLBAR,
        handwerkerId: h.id,
        betrieb: h.firma || h.name || `+${nummer}`,
        detail: `WhatsApp-Nachricht nicht zugestellt (${metaFehlerText(fehler?.code, fehler?.title)})${h.onboardingStatus ? `; Lead-Zustand: ${zustandLabel(h.onboardingStatus)}` : ""}`,
      },
    });
  }
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
