// Täglicher Vertragsende-Job (05:30): Pause nach 30 Tagen, Vorwarnung nach 83,
// Löschung nach 90 Tagen. Logik in betrieb/vertragsende.ts.
import cron from "node-cron";
import { prisma } from "../pipeline.js";
import { verarbeiteVertragsenden, PAUSE_NACH_TAGEN, LOESCHUNG_NACH_TAGEN } from "../betrieb/vertragsende.js";

export function starteVertragsendeJob(): void {
  cron.schedule("30 5 * * *", () => {
    verarbeiteVertragsenden(prisma)
      .then((e) => {
        if (e.pausiert || e.vorgewarnt || e.geloescht) console.log(`⏳ Vertragsende: ${e.pausiert} pausiert, ${e.vorgewarnt} vorgewarnt, ${e.geloescht} gelöscht (${e.geprueft} geprüft).`);
      })
      .catch((err) => console.error("Vertragsende-Job fehlgeschlagen:", err));
  });
  console.log(`⏳ Vertragsende-Job geplant (täglich 05:30: Pause nach ${PAUSE_NACH_TAGEN}, Löschung nach ${LOESCHUNG_NACH_TAGEN} Tagen).`);
}
