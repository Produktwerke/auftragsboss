// Testphase-Erinnerungen (15.09.2026, Dirk: „Bekommt man nach den 14 Tagen eine
// WhatsApp mit der Möglichkeit, ein Abo abzuschließen?" Bisher: nein).
//
// Täglicher Job (09:00): jedes Test-Konto, das mindestens ein Angebot gemacht
// hat, bekommt genau zweimal eine WhatsApp, jeweils als genehmigte Meta-Vorlage
// (business-initiiert, außerhalb des 24-h-Fensters):
//   • 3 Tage vor Ablauf:  Vorlage test_endet_bald  ({{1}} Name, {{2}} Datum, {{3}} Link)
//   • am Tag nach Ablauf: Vorlage test_abgelaufen  ({{1}} Name, {{2}} Link)
// Der Link führt zur Registrierung des Betriebs (danach Cockpit → Tarif wählen).
// Idempotent über Events TEST_ERINNERUNG (art), damit nie doppelt gesendet wird.
// Alte, längst abgelaufene Test-Konten bekommen nichts (Fenster nur am Ablauftag).
import cron from "node-cron";
import { prisma } from "../pipeline.js";
import { direkttestConfig } from "../config.js";
import { sendeWhatsAppVorlage } from "../whatsapp/send.js";
import { einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { registrierLink } from "../web/tokens.js";
import { spurEvent } from "../analytics/event.js";
import { WEBTEST_NUMMER } from "../web/webtest.js";

export type ErinnerungsArt = "ENDET_BALD" | "ABGELAUFEN";

/** Vorlagennamen (per .env überschreibbar). */
export function vorlageEndetBald(): string {
  return process.env.TEST_VORLAGE_ENDET_BALD?.trim() || "test_endet_bald";
}
export function vorlageAbgelaufen(): string {
  return process.env.TEST_VORLAGE_ABGELAUFEN?.trim() || "test_abgelaufen";
}

/** So viele Tage vor Ablauf kommt die erste Erinnerung. */
export const VORWARNUNG_TAGE = 3;
const TAG_MS = 24 * 60 * 60 * 1000;

/** Ablaufzeitpunkt eines Test-Kontos. */
export function testAblauf(erstelltAm: Date, testTage: number): Date {
  return new Date(erstelltAm.getTime() + testTage * TAG_MS);
}

/**
 * Welche Erinnerung ist heute fällig? Reine Funktion.
 *   ENDET_BALD: noch 3 Tage oder weniger, aber noch nicht abgelaufen (einmal).
 *   ABGELAUFEN: seit höchstens 2 Tagen abgelaufen (einmal); ältere Konten schweigen.
 */
export function faelligeErinnerung(
  erstelltAm: Date,
  testTage: number,
  schonGesendet: ReadonlySet<ErinnerungsArt>,
  jetzt = new Date(),
): ErinnerungsArt | null {
  const ablauf = testAblauf(erstelltAm, testTage).getTime();
  const rest = ablauf - jetzt.getTime();
  if (rest <= 0) {
    if (-rest <= 2 * TAG_MS && !schonGesendet.has("ABGELAUFEN")) return "ABGELAUFEN";
    return null;
  }
  if (rest <= VORWARNUNG_TAGE * TAG_MS && !schonGesendet.has("ENDET_BALD")) return "ENDET_BALD";
  return null;
}

/** Anrede für {{1}}: Name (Telefon-Lead), sonst Firma, sonst „Boss" (Markenton). */
export function anredeFuer(h: { name: string; firma: string }): string {
  return h.name.trim() || h.firma.trim() || "Boss";
}

const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface ErinnerungsErgebnis {
  gesendet: number;
  fehlgeschlagen: number;
}

/**
 * Prüft alle Test-Konten und sendet fällige Erinnerungen. `sende` ist
 * injizierbar (Tests, Probelauf). `erzwingeNummer` sendet beide Vorlagen an
 * genau diese Nummer, unabhängig vom Datum (Probelauf für den Betreiber).
 */
export async function sendeTestphaseErinnerungen(
  sende: typeof sendeWhatsAppVorlage = sendeWhatsAppVorlage,
  erzwingeNummer?: string,
): Promise<ErinnerungsErgebnis> {
  const cfg = direkttestConfig();
  const ergebnis: ErinnerungsErgebnis = { gesendet: 0, fehlgeschlagen: 0 };

  const konten = await prisma.handwerker.findMany({
    where: erzwingeNummer
      ? { whatsappNummer: erzwingeNummer }
      : { istTest: true, blockiert: false, whatsappNummer: { not: WEBTEST_NUMMER } },
    select: { id: true, name: true, firma: true, whatsappNummer: true, erstelltAm: true, einstellungenToken: true },
  });

  for (const h of konten) {
    // Nur wer AuftragsBoss wirklich ausprobiert hat, bekommt Erinnerungen.
    const angebote = await prisma.dokument.count({ where: { handwerkerId: h.id, version: 1 } });
    if (angebote === 0 && !erzwingeNummer) continue;

    const bisher = await prisma.event.findMany({ where: { typ: "TEST_ERINNERUNG", handwerkerId: h.id }, select: { dataJson: true } });
    const schonGesendet = new Set<ErinnerungsArt>();
    for (const e of bisher) {
      try {
        const art = (JSON.parse(e.dataJson) as { art?: string }).art;
        if (art === "ENDET_BALD" || art === "ABGELAUFEN") schonGesendet.add(art);
      } catch {
        /* Altdaten */
      }
    }

    const arten: ErinnerungsArt[] = erzwingeNummer
      ? ["ENDET_BALD", "ABGELAUFEN"]
      : (() => {
          const f = faelligeErinnerung(h.erstelltAm, cfg.DIREKTTEST_TAGE, schonGesendet);
          return f ? [f] : [];
        })();

    for (const art of arten) {
      const token = await einstellungenTokenBereit(prisma, h as never);
      const link = registrierLink(token);
      const anrede = anredeFuer(h);
      const ablauf = datumDE(testAblauf(h.erstelltAm, cfg.DIREKTTEST_TAGE));
      const ok =
        art === "ENDET_BALD"
          ? await sende(h.whatsappNummer, vorlageEndetBald(), [anrede, ablauf, link])
          : await sende(h.whatsappNummer, vorlageAbgelaufen(), [anrede, link]);
      const betrieb = h.firma || h.name || `+${h.whatsappNummer}`;
      if (ok) {
        ergebnis.gesendet++;
        await spurEvent(prisma, "TEST_ERINNERUNG", { handwerkerId: h.id, data: { art, probe: !!erzwingeNummer } });
        await prisma.adminLog.create({
          data: { aktion: "TEST_ERINNERUNG", handwerkerId: h.id, betrieb, detail: art === "ENDET_BALD" ? `Test endet am ${ablauf}, Erinnerung per WhatsApp` : "Test abgelaufen, Einladung zum Tarif per WhatsApp" },
        });
      } else {
        ergebnis.fehlgeschlagen++;
        console.warn(`Testphase-Erinnerung ${art} an ${betrieb} nicht gesendet (Vorlage genehmigt?)`);
      }
    }
  }
  return ergebnis;
}

export function starteTestphaseErinnerungsJob(): void {
  cron.schedule("0 9 * * *", () => {
    sendeTestphaseErinnerungen()
      .then((e) => {
        if (e.gesendet || e.fehlgeschlagen) console.log(`🔔 Testphase-Erinnerungen: ${e.gesendet} gesendet, ${e.fehlgeschlagen} fehlgeschlagen.`);
      })
      .catch((err) => console.error("Testphase-Erinnerungs-Job fehlgeschlagen:", err));
  });
  console.log(`🔔 Testphase-Erinnerungs-Job geplant (täglich 09:00, ${VORWARNUNG_TAGE} Tage vor Ablauf und am Tag danach).`);
}
