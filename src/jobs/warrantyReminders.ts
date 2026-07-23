// Gewährleistungs-Tracking: täglicher Cron (07:00 Uhr) prüft alle Fristen.
//   - 3 Monate vor Ablauf → "Wartungsangebot machen!"-Mail
//   - bei Ablauf          → "Haftung beendet"-Mail
// Idempotent über die *Gesendet-Flags — doppelte Mails ausgeschlossen.
import cron from "node-cron";
import { prisma } from "../pipeline.js";
import { gewaehrleistungsErinnerung } from "../email/templates.js";
import { sendeMail } from "../email/send.js";

async function pruefeGewaehrleistungen(): Promise<void> {
  const jetzt = new Date();
  const einschluss = { dokument: { include: { handwerker: true } } } as const;

  // ── Vorwarnungen (3 Monate vor Ablauf) ────────────────────
  const vorwarnungen = await prisma.gewaehrleistung.findMany({
    where: { vorwarnung: { lte: jetzt }, vorwarnungGesendet: false },
    include: einschluss,
  });

  for (const g of vorwarnungen) {
    const mail = gewaehrleistungsErinnerung({
      art: "VORWARNUNG",
      kunde: g.dokument.kundeName ?? "Unbekannter Kunde",
      datum: g.dokument.datum,
      ablauf: g.ablauf,
      nummer: g.dokument.nummer,
      einleitung: g.dokument.einleitung,
    });
    await sendeMail(g.dokument.handwerker.email, mail.betreff, mail.html);
    await prisma.gewaehrleistung.update({
      where: { id: g.id },
      data: { vorwarnungGesendet: true },
    });
    console.log(`🔔 Vorwarnung gesendet: ${g.dokument.nummer}`);
  }

  // ── Ablauf-Meldungen ──────────────────────────────────────
  const abgelaufen = await prisma.gewaehrleistung.findMany({
    where: { ablauf: { lte: jetzt }, ablaufGesendet: false },
    include: einschluss,
  });

  for (const g of abgelaufen) {
    const mail = gewaehrleistungsErinnerung({
      art: "ABLAUF",
      kunde: g.dokument.kundeName ?? "Unbekannter Kunde",
      datum: g.dokument.datum,
      ablauf: g.ablauf,
      nummer: g.dokument.nummer,
      einleitung: g.dokument.einleitung,
    });
    await sendeMail(g.dokument.handwerker.email, mail.betreff, mail.html);
    await prisma.gewaehrleistung.update({
      where: { id: g.id },
      data: { ablaufGesendet: true },
    });
    console.log(`✅ Ablauf-Meldung gesendet: ${g.dokument.nummer}`);
  }
}

export function starteGewaehrleistungsJob(): void {
  // Täglich 07:00 Uhr Serverzeit
  cron.schedule("0 7 * * *", () => {
    pruefeGewaehrleistungen().catch((err) =>
      console.error("Gewährleistungs-Job fehlgeschlagen:", err),
    );
  });
  console.log("⏰ Gewährleistungs-Job geplant (täglich 07:00 Uhr).");
}
