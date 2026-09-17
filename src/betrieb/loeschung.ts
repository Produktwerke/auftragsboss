// Betrieb mit allen Daten löschen (DSGVO-Kaskade). Ein Weg für alle Auslöser:
// Betreiber-Cockpit, Selbstlöschung des Betriebs (Einstellungen) und die
// automatische Löschung 90 Tage nach Vertragsende (jobs/vertragsende.ts).
//
// Bleibt: Events (PII-frei, Produktmetriken), AdminLog (Nachweis mit Firmenname),
// Buchungs-Ledger (Abrechnungsnachweis, handelsrechtliche Aufbewahrung).
import { unlink } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { loescheFotosVonBetrieb } from "./fotoAblage.js";

export interface LoeschKandidat {
  id: string;
  firma: string;
  name: string;
  whatsappNummer: string;
  logoDatei: string | null;
}

export async function loescheBetrieb(prisma: PrismaClient, h: LoeschKandidat, ausloeser: string): Promise<void> {
  // Alles Fachliche in EINER Transaktion. Abo und Mitarbeiter kaskadieren über das Schema.
  await prisma.$transaction([
    prisma.gewaehrleistung.deleteMany({ where: { dokument: { handwerkerId: h.id } } }),
    prisma.dokument.deleteMany({ where: { handwerkerId: h.id } }),
    prisma.vorgang.deleteMany({ where: { handwerkerId: h.id } }),
    prisma.feedback.deleteMany({ where: { handwerkerId: h.id } }),
    prisma.empfehlung.deleteMany({ where: { werberId: h.id } }),
    prisma.preisgedaechtnis.deleteMany({ where: { handwerkerId: h.id } }),
    prisma.importDokument.deleteMany({ where: { handwerkerId: h.id } }), // Positionen kaskadieren
    prisma.foto.deleteMany({ where: { handwerkerId: h.id } }),
    prisma.handwerker.delete({ where: { id: h.id } }),
  ]);

  // Foto-Ordner und Logo-Datei aufräumen (best effort, DB-Löschung ist da schon durch).
  loescheFotosVonBetrieb(h.id);
  if (h.logoDatei) {
    try {
      await unlink(h.logoDatei);
    } catch {
      /* Datei fehlt schon oder Pfad ungültig */
    }
  }

  await prisma.adminLog.create({
    data: {
      aktion: "GELOESCHT",
      handwerkerId: h.id,
      betrieb: h.firma || h.name || `+${h.whatsappNummer}`,
      detail: `Betrieb ${h.firma || h.name} (+${h.whatsappNummer}) mit allen Daten gelöscht (${ausloeser})`,
    },
  });
}
