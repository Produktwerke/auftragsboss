// Telefon-Akquise-Onboarding: Nach einem Erstgespräch (mit ausdrücklicher
// WhatsApp-Einwilligung!) schreibt AuftragsBoss den Interessenten ZUERST an.
//
// Ablauf (bewusst so kurz wie möglich — der Lead soll binnen Sekunden vom
// Leser zum Anwender werden, keine Mini-Landingpage im Chat):
//
//   Betreiber legt Lead im Cockpit an → genehmigte Meta-VORLAGE mit zwei
//   Schnellantwort-Knöpfen [Ja, los geht's] [Kurz erklären] → Klick öffnet
//   das 24-h-Fenster → EINE kurze Aufforderung zur Sprachnachricht → die
//   normale Angebots-Pipeline übernimmt (Test-Konto, 14 Tage Testphase).
//
// Schickt der Lead direkt eine Sprachnachricht ohne Knopfdruck, funktioniert
// das genauso (die Pipeline behandelt ihn wie jedes Test-Konto).
//
// WICHTIG (Meta): Die Erstnachricht MUSS eine genehmigte Vorlage sein
// (business-initiiert). Das Opt-in wird mit Zeitpunkt und Quelle am
// Handwerker dokumentiert (Meta-Vorgabe bei Akquise-Nachrichten).
import type { Handwerker, PrismaClient } from "@prisma/client";
import { sendeWhatsAppText, sendeWhatsAppKnoepfe, sendeWhatsAppVorlage } from "../whatsapp/send.js";
import { spurEvent } from "../analytics/event.js";
import { normalisiereHandy } from "../config.js";

// Kennungen der Antwort-Knöpfe (kommen im Webhook als knopfPayload zurück).
export const KNOPF_JA = "LEAD_JA";
export const KNOPF_ERKLAEREN = "LEAD_ERKLAEREN";
export const KNOPF_AUSPROBIEREN = "LEAD_AUSPROBIEREN";

/** Name der bei Meta genehmigten Einladungs-Vorlage (überschreibbar per .env). */
export function leadVorlagenName(): string {
  return process.env.LEAD_VORLAGE?.trim() || "angebot_ausprobieren";
}

/** Vorlage für Interessenten, die auf der Website ihre Nummer eintragen (15.09.2026). */
export function testVorlagenName(): string {
  return process.env.TEST_VORLAGE?.trim() || "test_starten";
}

// Die EINE Aufforderung nach "Ja, los geht's" — danach wird gewartet, nichts
// weiter gesendet. (Hausregel: keine Gedankenstriche in Nutzertexten.)
// Beide Antworten beginnen mit einer kurzen Vorstellung der KI (15.09.2026, Dirk):
// Die Einladung per Vorlage klingt nach Sie, AuftragsBoss selbst duzt wie auf der
// Baustelle. So ist klar, dass ab hier die KI spricht, nicht der Anrufer von eben.
const VORSTELLUNG = "👋 Hallo, ich bin AuftragsBoss, deine KI für Malerangebote.";

const AUFFORDERUNG =
  VORSTELLUNG +
  "\n\nDenk an einen echten Auftrag, den du gerade auf dem Tisch hast.\n\n" +
  "Schick mir einfach eine Sprachnachricht und erzähl mir, was gemacht werden soll. " +
  "So, wie du es einem Mitarbeiter erklären würdest. 🎙️";

// Ausführlicher seit 13.09.2026 (Dirks Sprachnotizen): Ziel, die drei Eingabewege
// und was danach passiert. Bleibt unter den 1024 Zeichen einer Knopfnachricht.
const ERKLAERUNG =
  VORSTELLUNG +
  "\n\nSo funktioniert es:\n\n" +
  "1️⃣ Du erzählst mir per Sprachnachricht, was beim Kunden gemacht werden soll: Kunde, Adresse, Raum, Maße, Arbeiten. " +
  "So, wie du es einem Mitarbeiter sagen würdest.\n" +
  "2️⃣ Hast du einen Notizzettel mit den Maßen? Einfach abfotografieren, ich lese ihn.\n" +
  "3️⃣ Fotos von Fenstern und Türen (hochkant, Boden und Decke mit drauf) sind freiwillig. Daraus rechne ich die Abzüge fürs Aufmaß.\n\n" +
  "Daraus mache ich sofort ein Angebot mit allen Positionen und schicke dir den Link. " +
  "Fehlt etwas oder passt etwas nicht, sagst du es mir einfach, ich mache eine neue Fassung. " +
  "Preise musst du nicht diktieren, die trägst du im Angebot ein oder sagst sie mir.\n\n" +
  "Probier es aus, das dauert keine zwei Minuten.";

export type LeadSender = {
  vorlage: typeof sendeWhatsAppVorlage;
  text: typeof sendeWhatsAppText;
  knoepfe: typeof sendeWhatsAppKnoepfe;
};
const echterSender: LeadSender = {
  vorlage: sendeWhatsAppVorlage,
  text: sendeWhatsAppText,
  knoepfe: sendeWhatsAppKnoepfe,
};

/**
 * Lead anlegen und die Einladungs-Vorlage senden (aus dem Betreiber-Cockpit).
 * Gibt bei Erfolg den Handwerker zurück, sonst eine Fehlermeldung fürs UI.
 */
export async function legeLeadAnUndLadeEin(
  prisma: PrismaClient,
  args: {
    nummer: string;
    anrede: string;
    firma?: string;
    optInQuelle?: string;
    /** "TELEFON" (Cockpit, Standard) oder "WEBSITE" (Nummer selbst eingetragen). */
    leadQuelle?: string;
    /** Abweichende Meta-Vorlage, z.B. test_starten für Website-Interessenten. */
    vorlage?: string;
  },
  sender: LeadSender = echterSender,
): Promise<{ handwerker: Handwerker } | { fehler: string }> {
  const nummer = normalisiereHandy(args.nummer);
  if (!nummer) return { fehler: "Bitte eine gültige Handynummer angeben (z. B. 0176 1234567)." };
  const anrede = args.anrede.trim();
  if (anrede.length < 2) return { fehler: "Bitte die Anrede angeben (z. B. Herr Müller), sie steht in der Nachricht." };

  const vorhanden = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer } });
  if (vorhanden) {
    return { fehler: `Diese Nummer ist schon im System (${vorhanden.firma || vorhanden.name || "ohne Name"}).` };
  }

  const handwerker = await prisma.handwerker.create({
    data: {
      whatsappNummer: nummer,
      name: anrede,
      firma: (args.firma ?? "").trim(),
      email: "",
      istTest: true, // startet mit dem Gratis-Kontingent wie jeder Test
      leadQuelle: args.leadQuelle ?? "TELEFON",
      optInAm: new Date(),
      optInQuelle: (args.optInQuelle ?? "telefonat").trim() || "telefonat",
      onboardingStatus: "EINGELADEN",
    },
  });
  await spurEvent(prisma, "LEAD_ANGELEGT", {
    handwerkerId: handwerker.id,
    data: { quelle: handwerker.optInQuelle },
  });

  const ok = await sender.vorlage(nummer, args.vorlage ?? leadVorlagenName(), [anrede], [KNOPF_JA, KNOPF_ERKLAEREN]);
  if (!ok) {
    // Lead bleibt angelegt (Opt-in ist dokumentiert) — der Betreiber sieht den
    // Fehler und kann es erneut versuchen (z. B. Vorlage noch nicht genehmigt).
    return { fehler: "Lead angelegt, aber die WhatsApp-Einladung konnte nicht gesendet werden. Ist die Vorlage bei Meta genehmigt?" };
  }
  await spurEvent(prisma, "LEAD_EINLADUNG_GESENDET", { handwerkerId: handwerker.id });
  return { handwerker };
}

/**
 * Klick auf einen Onboarding-Knopf verarbeiten (aus dem Webhook, ohne KI).
 * Idempotent: doppelt zugestellte Klicks lösen keine doppelte Aufforderung aus.
 */
export async function verarbeiteOnboardingKnopf(
  prisma: PrismaClient,
  handwerker: Handwerker,
  payload: string,
  sender: LeadSender = echterSender,
): Promise<void> {
  if (payload === KNOPF_JA || payload === KNOPF_AUSPROBIEREN) {
    // Schutz gegen doppelte Webhooks/Doppelklicks binnen Sekunden.
    if (handwerker.onboardingStatus === "WARTET_AUF_AUFTRAG") return;
    await prisma.handwerker.update({
      where: { id: handwerker.id },
      data: { onboardingStatus: "WARTET_AUF_AUFTRAG" },
    });
    await spurEvent(prisma, "LEAD_KNOPF", {
      handwerkerId: handwerker.id,
      data: { knopf: payload === KNOPF_JA ? "ja" : "ausprobieren" },
    });
    await sender.text(handwerker.whatsappNummer, AUFFORDERUNG);
    return;
  }

  if (payload === KNOPF_ERKLAEREN) {
    if (handwerker.onboardingStatus === "ERKLAERT") return;
    await prisma.handwerker.update({
      where: { id: handwerker.id },
      data: { onboardingStatus: "ERKLAERT" },
    });
    await spurEvent(prisma, "LEAD_KNOPF", { handwerkerId: handwerker.id, data: { knopf: "erklaeren" } });
    await sender.knoepfe(handwerker.whatsappNummer, ERKLAERUNG, [
      { id: KNOPF_AUSPROBIEREN, titel: "Angebot ausprobieren" },
    ]);
    return;
  }
  // Unbekannte Kennung: bewusst still ignorieren (kein Rätsel-Text an den Nutzer).
}

/**
 * Erste ECHTE Eingabe eines Leads (Sprache/Foto/Text, auch ohne Knopfdruck):
 * Onboarding als erledigt markieren. Läuft VOR der normalen Pipeline, ändert
 * an ihr nichts. Gibt zurück, ob es die erste Eingabe war (fürs Tracking).
 */
export async function markiereLeadAktiv(prisma: PrismaClient, handwerker: Handwerker): Promise<boolean> {
  if (!handwerker.onboardingStatus || handwerker.onboardingStatus === "AKTIV") return false;
  await prisma.handwerker.updateMany({
    where: { id: handwerker.id, NOT: { onboardingStatus: "AKTIV" } },
    data: { onboardingStatus: "AKTIV" },
  });
  await spurEvent(prisma, "LEAD_ERSTE_EINGABE", { handwerkerId: handwerker.id });
  return true;
}
