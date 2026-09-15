// Funnel-Auswertung je Leadquelle (Etappe 2, 15.09.2026). Rein und testbar:
// bekommt Betriebe, Events, Angebotszähler und Abos, liefert je Quelle die
// Stufen mit Anzahl und Anteil. Die Cockpit-Seite rendert nur.
//
// Stufen (jede Stufe zählt Betriebe, die sie erreicht haben, nicht Ereignisse):
//   Leads → Einladung gesendet → zugestellt → gelesen → Knopf geklickt
//        → erste Eingabe → erstes Angebot → Abo
// Bei Direkt-Interessenten (ohne Einladung) sind die Einladungs-Stufen leer.
import { zustandLabel } from "./status.js";

export type Quelle = "TELEFON" | "WEBSITE" | "DIREKT";

export interface FunnelBetrieb {
  id: string;
  leadQuelle: string | null;
  istTest: boolean;
  onboardingStatus: string | null;
  testNachrichten: number;
  erstelltAm: Date;
  blockiert: boolean;
  name: string;
  firma: string;
}

export interface FunnelStufe {
  key: string;
  label: string;
  anzahl: number;
  /** Anteil an den Leads der Quelle in Prozent (0..100) oder null bei 0 Leads / nicht anwendbar. */
  anteil: number | null;
  anwendbar: boolean;
}

export interface FunnelQuelle {
  quelle: Quelle;
  label: string;
  leads: number;
  stufen: FunnelStufe[];
}

export interface OffenerLead {
  id: string;
  anzeige: string;
  quelle: Quelle;
  zustand: string;
  zustandLabel: string;
  tage: number;
  erinnert: boolean;
}

export interface FunnelErgebnis {
  quellen: FunnelQuelle[];
  offeneLeads: OffenerLead[];
}

const QUELLEN: Array<{ quelle: Quelle; label: string }> = [
  { quelle: "TELEFON", label: "Telefon-Akquise" },
  { quelle: "WEBSITE", label: "Website-Formular" },
  { quelle: "DIREKT", label: "Direkt per WhatsApp" },
];

export function quelleVon(b: { leadQuelle: string | null }): Quelle {
  if (b.leadQuelle === "TELEFON") return "TELEFON";
  if (b.leadQuelle === "WEBSITE") return "WEBSITE";
  return "DIREKT";
}

/** Zustände, die zählen als „hat reagiert" (Knopf) bzw. „hat etwas eingesprochen". */
const KNOPF_ZUSTAENDE = new Set(["ERKLAERT", "WARTET_AUF_AUFTRAG"]);

export function berechneFunnel(args: {
  betriebe: FunnelBetrieb[];
  /** Event-Typen je Betrieb (nur die relevanten). */
  eventsJeBetrieb: Map<string, Set<string>>;
  /** Anzahl Erstfassungen (version 1) je Betrieb. */
  angeboteJeBetrieb: Map<string, number>;
  /** Betriebe mit (jemals) Abo. */
  aboBetriebe: Set<string>;
  jetzt?: Date;
}): FunnelErgebnis {
  const jetzt = args.jetzt ?? new Date();
  const quellen: FunnelQuelle[] = [];

  for (const q of QUELLEN) {
    const gruppe = args.betriebe.filter((b) => quelleVon(b) === q.quelle);
    const leads = gruppe.length;
    const ev = (b: FunnelBetrieb) => args.eventsJeBetrieb.get(b.id) ?? new Set<string>();
    const zaehle = (f: (b: FunnelBetrieb) => boolean) => gruppe.filter(f).length;
    const mitEinladung = q.quelle !== "DIREKT";

    const eingeladen = zaehle((b) => ev(b).has("LEAD_EINLADUNG_GESENDET"));
    const zugestellt = zaehle((b) => ev(b).has("LEAD_ZUGESTELLT") || ev(b).has("LEAD_GELESEN") || ev(b).has("LEAD_KNOPF") || ev(b).has("LEAD_ERSTE_EINGABE"));
    const gelesen = zaehle((b) => ev(b).has("LEAD_GELESEN") || ev(b).has("LEAD_KNOPF") || ev(b).has("LEAD_ERSTE_EINGABE"));
    const knopf = zaehle((b) => ev(b).has("LEAD_KNOPF") || KNOPF_ZUSTAENDE.has(b.onboardingStatus ?? "") || b.onboardingStatus === "AKTIV");
    const eingabe = zaehle((b) => ev(b).has("LEAD_ERSTE_EINGABE") || b.onboardingStatus === "AKTIV" || b.testNachrichten > 0 || (args.angeboteJeBetrieb.get(b.id) ?? 0) > 0);
    const angebot = zaehle((b) => (args.angeboteJeBetrieb.get(b.id) ?? 0) > 0);
    const abo = zaehle((b) => args.aboBetriebe.has(b.id));

    const stufe = (key: string, label: string, anzahl: number, anwendbar = true): FunnelStufe => ({
      key,
      label,
      anzahl: anwendbar ? anzahl : 0,
      anteil: anwendbar && leads > 0 ? Math.round((anzahl / leads) * 100) : null,
      anwendbar,
    });

    quellen.push({
      quelle: q.quelle,
      label: q.label,
      leads,
      stufen: [
        stufe("leads", "Leads", leads),
        stufe("eingeladen", "Einladung gesendet", eingeladen, mitEinladung),
        stufe("zugestellt", "Zugestellt", zugestellt, mitEinladung),
        stufe("gelesen", "Gelesen", gelesen, mitEinladung),
        stufe("knopf", "Knopf geklickt", knopf, mitEinladung),
        stufe("eingabe", "Erste Eingabe", eingabe),
        stufe("angebot", "Erstes Angebot", angebot),
        stufe("abo", "Abo", abo),
      ],
    });
  }

  // Offene Leads: eingeladen, aber noch nichts eingesprochen (zum Nachfassen), neueste zuerst.
  const offeneLeads: OffenerLead[] = args.betriebe
    .filter((b) => b.leadQuelle && !b.blockiert && b.onboardingStatus && b.onboardingStatus !== "AKTIV")
    .map((b) => ({
      id: b.id,
      anzeige: b.firma.trim() || b.name.trim() || "(ohne Namen)",
      quelle: quelleVon(b),
      zustand: b.onboardingStatus ?? "",
      zustandLabel: zustandLabel(b.onboardingStatus),
      tage: Math.floor((jetzt.getTime() - b.erstelltAm.getTime()) / 86_400_000),
      erinnert: (args.eventsJeBetrieb.get(b.id) ?? new Set()).has("LEAD_ERINNERUNG"),
    }))
    .sort((a, b) => a.tage - b.tage);

  return { quellen, offeneLeads };
}
