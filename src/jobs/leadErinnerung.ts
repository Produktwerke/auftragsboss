// Lead-Erinnerung (Etappe 2, 15.09.2026): Wer eingeladen wurde, aber nach ein
// paar Tagen nichts eingesprochen hat, bekommt GENAU EINE Erinnerung als
// genehmigte Meta-Vorlage (business-initiiert, mit denselben zwei Knöpfen wie
// die Einladung). Hinter einem Feature-Flag, weil die Vorlage erst bei Meta
// genehmigt sein muss und Dirk den Ton vorher live sehen will.
//
//   FEATURE_LEAD_ERINNERUNG=1      Job scharf (Standard: aus)
//   LEAD_VORLAGE_ERINNERUNG=…      Vorlagenname (Standard: lead_erinnerung, {{1}} = Anrede)
//   LEAD_ERINNERUNG_TAGE=2         Tage nach der Einladung
//
// Idempotent über das Event LEAD_ERINNERUNG. Läuft täglich 10:00 (nach den
// Testphase-Erinnerungen um 09:00, damit niemand zwei Nachrichten auf einmal bekommt).
import cron from "node-cron";
import { prisma } from "../pipeline.js";
import { featureConfig } from "../config.js";
import { sendeWhatsAppVorlage } from "../whatsapp/send.js";
import { spurEvent } from "../analytics/event.js";
import { KNOPF_ERKLAEREN, KNOPF_JA } from "../lead/onboarding.js";
import { ERINNERBARE_ZUSTAENDE } from "../lead/status.js";

const TAG_MS = 24 * 60 * 60 * 1000;

export function vorlageErinnerung(): string {
  return process.env.LEAD_VORLAGE_ERINNERUNG?.trim() || "lead_erinnerung";
}

export function erinnerungNachTagen(): number {
  const n = Number(process.env.LEAD_ERINNERUNG_TAGE ?? "");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

/**
 * Ist ein Lead fällig für die Erinnerung? Rein, testbar.
 *   • Lead (leadQuelle gesetzt), Einladung wurde gesendet, nicht blockiert
 *   • Zustand: eingeladen/zugestellt/gelesen/Erklärung angesehen (nichts eingesprochen)
 *   • Einladung mindestens `tage` alt, noch keine Erinnerung
 *   • nicht älter als 30 Tage (dann ist der Lead kalt; Meta-Opt-in nicht überstrapazieren)
 */
export function faelligFuerErinnerung(
  h: { leadQuelle: string | null; onboardingStatus: string | null; blockiert: boolean; erstelltAm: Date },
  ereignisse: ReadonlySet<string>,
  tage: number,
  jetzt = new Date(),
): boolean {
  if (!h.leadQuelle || h.blockiert) return false;
  if (!h.onboardingStatus || !ERINNERBARE_ZUSTAENDE.has(h.onboardingStatus)) return false;
  if (!ereignisse.has("LEAD_EINLADUNG_GESENDET") || ereignisse.has("LEAD_ERINNERUNG")) return false;
  const alter = jetzt.getTime() - h.erstelltAm.getTime();
  return alter >= tage * TAG_MS && alter <= 30 * TAG_MS;
}

export interface ErinnerungsErgebnis {
  geprueft: number;
  gesendet: number;
  fehlgeschlagen: number;
}

export async function sendeLeadErinnerungen(
  sende: typeof sendeWhatsAppVorlage = sendeWhatsAppVorlage,
  jetzt = new Date(),
): Promise<ErinnerungsErgebnis> {
  const ergebnis: ErinnerungsErgebnis = { geprueft: 0, gesendet: 0, fehlgeschlagen: 0 };
  const tage = erinnerungNachTagen();
  const leads = await prisma.handwerker.findMany({
    where: { leadQuelle: { not: null }, blockiert: false, onboardingStatus: { in: [...ERINNERBARE_ZUSTAENDE] } },
    select: { id: true, name: true, firma: true, whatsappNummer: true, leadQuelle: true, onboardingStatus: true, blockiert: true, erstelltAm: true },
  });
  for (const h of leads) {
    ergebnis.geprueft++;
    const events = await prisma.event.findMany({
      where: { handwerkerId: h.id, typ: { in: ["LEAD_EINLADUNG_GESENDET", "LEAD_ERINNERUNG"] } },
      select: { typ: true },
    });
    if (!faelligFuerErinnerung(h, new Set(events.map((e) => e.typ)), tage, jetzt)) continue;

    const anrede = h.name.trim() || h.firma.trim() || "Boss";
    const ok = await sende(h.whatsappNummer, vorlageErinnerung(), [anrede], [KNOPF_JA, KNOPF_ERKLAEREN]);
    const betrieb = h.firma || h.name || `+${h.whatsappNummer}`;
    if (ok) {
      ergebnis.gesendet++;
      await spurEvent(prisma, "LEAD_ERINNERUNG", { handwerkerId: h.id, data: { nachTagen: tage, zustand: h.onboardingStatus } });
      await prisma.adminLog.create({
        data: { aktion: "LEAD_ERINNERUNG", handwerkerId: h.id, betrieb, detail: `Erinnerung per WhatsApp (${tage} Tage nach Einladung, Zustand ${h.onboardingStatus})` },
      });
    } else {
      ergebnis.fehlgeschlagen++;
      console.warn(`Lead-Erinnerung an ${betrieb} nicht gesendet (Vorlage ${vorlageErinnerung()} genehmigt?)`);
    }
  }
  return ergebnis;
}

export function starteLeadErinnerungsJob(): void {
  if (!featureConfig().FEATURE_LEAD_ERINNERUNG) {
    console.log("🔕 Lead-Erinnerungs-Job aus (FEATURE_LEAD_ERINNERUNG=0).");
    return;
  }
  cron.schedule("0 10 * * *", () => {
    sendeLeadErinnerungen()
      .then((e) => {
        if (e.gesendet || e.fehlgeschlagen) console.log(`🔔 Lead-Erinnerungen: ${e.gesendet} gesendet, ${e.fehlgeschlagen} fehlgeschlagen (${e.geprueft} geprüft).`);
      })
      .catch((err) => console.error("Lead-Erinnerungs-Job fehlgeschlagen:", err));
  });
  console.log(`🔔 Lead-Erinnerungs-Job geplant (täglich 10:00, ${erinnerungNachTagen()} Tage nach der Einladung, Vorlage ${vorlageErinnerung()}).`);
}
