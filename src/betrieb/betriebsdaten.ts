// Führt die Stammdaten eines Betriebs zusammen.
//
// Jeder Handwerker pflegt seine Daten (Logo, Adresse, Farbe, Standardtexte)
// über die Einstellungsseite in seinem Handwerker-Datensatz. preisliste.json
// liefert nur noch die Vorgaben für den Einzelbetrieb im Test. Diese Funktion
// legt die Handwerker-Werte über die Vorgaben: Was der Betrieb gesetzt hat,
// gewinnt; wo er nichts gesetzt hat, bleibt die Vorgabe stehen.
//
// Ergebnis ist wieder eine vollständige Preisliste — so bleiben Word-, PDF-
// und Editor-Erzeugung unverändert, sie bekommen nur die richtigen Betriebs-
// daten hineingereicht.
import type { Handwerker, PrismaClient } from "@prisma/client";
import type { Preisliste } from "../preisliste.js";
import { erzeugeToken } from "../web/tokens.js";

/** Nimmt den Handwerker-Wert, wenn gesetzt — sonst die Vorgabe. */
const oder = (wert: string | null | undefined, vorgabe: string): string =>
  wert && wert.trim() ? wert.trim() : vorgabe;

export function effektivePreisliste(handwerker: Handwerker, basis: Preisliste): Preisliste {
  const b = basis.betrieb;
  const farbe = handwerker.farbe && /^[0-9a-fA-F]{6}$/.test(handwerker.farbe) ? handwerker.farbe : b.farbe;
  return {
    ...basis,
    betrieb: {
      ...b,
      firma: oder(handwerker.firma, b.firma),
      inhaber: oder(handwerker.name, b.inhaber),
      strasse: oder(handwerker.strasse, b.strasse),
      plz: oder(handwerker.plz, b.plz),
      ort: oder(handwerker.ort, b.ort),
      telefon: oder(handwerker.telefon, b.telefon),
      email: oder(handwerker.email, b.email),
      gewerk: oder(handwerker.gewerk, b.gewerk),
      ustIdNr: oder(handwerker.ustIdNr, b.ustIdNr),
      bank: oder(handwerker.bank, b.bank),
      farbe,
      // KEIN Demo-Logo-Fallback: Ein Betrieb zeigt sein EIGENES Logo oder gar
      // keins — niemals das Muster-Logo eines anderen. Fehlt das eigene Logo,
      // bleibt der Briefkopf im Kunden-Dokument schlicht (nur Firmenname); der
      // Editor zeigt an dieser Stelle einen "Dein Logo"-Platzhalter.
      logo: handwerker.logoDatei?.trim() ? handwerker.logoDatei : "",
    },
    // Konditionen je Betrieb: Gültigkeitsdauer und Zahlungsziel darf jeder
    // Betrieb selbst festlegen (Einstellungsseite); leer = Vorgabe aus der JSON.
    // Landet über summe.gueltigBis bzw. konditionen.zahlungsziel in PDF, Word
    // und E-Mail — die Erzeuger bleiben unverändert.
    konditionen: {
      ...basis.konditionen,
      ...(handwerker.angebotGueltigTage && handwerker.angebotGueltigTage > 0
        ? { angebotGueltigTage: handwerker.angebotGueltigTage }
        : {}),
      zahlungsziel: oder(handwerker.zahlungsziel, basis.konditionen.zahlungsziel),
    },
  };
}

/**
 * Liefert den persönlichen Einstellungs-Token — und erzeugt ihn beim ersten
 * Aufruf, falls der Betrieb noch keinen hat. So funktioniert der Link auch für
 * Bestandsdatensätze, ohne dass eine Datenwanderung nötig wäre.
 */
export async function einstellungenTokenBereit(
  prisma: PrismaClient,
  handwerker: Handwerker,
): Promise<string> {
  if (handwerker.einstellungenToken) return handwerker.einstellungenToken;
  const token = erzeugeToken();
  await prisma.handwerker.update({
    where: { id: handwerker.id },
    data: { einstellungenToken: token },
  });
  return token;
}
