// Chat-Auswertung Stufe 1 (17.09.2026): Kennzahlen zum Dialog zwischen Maler
// und AuftragsBoss, ausschließlich aus der Ereignistabelle und den Vorgangs-/
// Dokument-Metadaten. Es wird KEIN Nachrichteninhalt gelesen (kein Transkript,
// kein nachrichtenJson), nur Zähler, Zeitstempel und Kanäle. Damit ist die
// Auswertung Betriebsstatistik ohne personenbezogenen Inhalt.
//
// Stufe 2 (pseudonymisierte Dialog-Stichprobe) ist bewusst NICHT gebaut, bis
// Datenschutzerklärung und Auftragsverarbeitung sie benennen (Memory chat-auswertung-dsgvo).
export interface KennzahlEvent {
  typ: string;
  handwerkerId: string | null;
  dataJson: string;
  erstelltAm: Date;
}
export interface KennzahlVorgang {
  handwerkerId: string;
  status: string;
  runde: number;
  begonnenAm: Date;
  letzteAktivitaet: Date;
  dokumentId: string | null;
  fehlversuche: number;
}
export interface KennzahlDokument {
  id: string;
  handwerkerId: string;
  nummer: string;
  version: number;
  erstelltAm: Date;
}

export interface ChatKennzahlen {
  nachrichten: { gesamt: number; sprache: number; foto: number; text: number; knopf: number; blockiert: number };
  vorgaenge: { gesamt: number; mitAngebot: number; abgebrochen: number; offen: number; mitFehlversuchen: number; ueberholt: number };
  zeitBisAngebot: { anzahl: number; medianMin: number | null; p90Min: number | null };
  rueckfragen: { anzahl: number; vorgaengeMitRueckfrage: number; quoteProzent: number | null; maxRunde: number };
  fassungen: { angebote: number; mitKorrektur: number; quoteProzent: number | null; schnittFassungen: number | null };
  knoepfe: { raumWeiter: number; korrigieren: number };
  links: { gesamt: number; jeZiel: Record<string, number>; jeGeraet: Record<string, number> };
  wandfotos: { anzahl: number; komplettProzent: number | null; nachfassenProzent: number | null };
}

function daten(e: KennzahlEvent): Record<string, unknown> {
  try {
    return JSON.parse(e.dataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function perzentil(werte: number[], p: number): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

const prozent = (teil: number, ganz: number): number | null => (ganz > 0 ? Math.round((teil / ganz) * 100) : null);
const rund1 = (x: number) => Math.round(x * 10) / 10;

export function berechneChatKennzahlen(args: {
  events: KennzahlEvent[];
  vorgaenge: KennzahlVorgang[];
  dokumente: KennzahlDokument[];
  /** Betriebe, die ausgeschlossen werden (z. B. Test-Konten bei „nur echte Betriebe", Webtest-Sammelkonto immer). */
  ausgeschlossen: ReadonlySet<string>;
}): ChatKennzahlen {
  const drin = (id: string | null) => !id || !args.ausgeschlossen.has(id);
  const events = args.events.filter((e) => drin(e.handwerkerId));
  const vorgaenge = args.vorgaenge.filter((v) => drin(v.handwerkerId));
  const dokumente = args.dokumente.filter((d) => drin(d.handwerkerId));
  const dokById = new Map(dokumente.map((d) => [d.id, d]));
  const vom = (typ: string) => events.filter((e) => e.typ === typ);

  // Nachrichten je Kanal
  const empfangen = vom("NACHRICHT_EMPFANGEN");
  const kanal = (k: string) => empfangen.filter((e) => daten(e).kanal === k).length;
  const nachrichten = {
    gesamt: empfangen.length,
    sprache: kanal("sprache"),
    foto: kanal("foto"),
    text: kanal("text"),
    knopf: kanal("knopf"),
    blockiert: vom("NACHRICHT_BLOCKIERT").length,
  };

  // Vorgänge
  const mitAngebot = vorgaenge.filter((v) => v.dokumentId);
  const vorg = {
    gesamt: vorgaenge.length,
    mitAngebot: mitAngebot.length,
    abgebrochen: vorgaenge.filter((v) => !v.dokumentId && v.status === "ABGESCHLOSSEN").length,
    offen: vorgaenge.filter((v) => v.status === "OFFEN").length,
    mitFehlversuchen: vorgaenge.filter((v) => v.fehlversuche > 0).length,
    ueberholt: vom("AUSWERTUNG_UEBERHOLT").length,
  };

  // Zeit bis zum Angebot (Minuten): Vorgangsbeginn bis Erstellung des zugehörigen Dokuments
  const minuten = mitAngebot
    .map((v) => {
      const d = v.dokumentId ? dokById.get(v.dokumentId) : undefined;
      return d ? (d.erstelltAm.getTime() - v.begonnenAm.getTime()) / 60_000 : null;
    })
    .filter((m): m is number => m !== null && m >= 0);
  const zeitBisAngebot = {
    anzahl: minuten.length,
    medianMin: minuten.length ? rund1(median(minuten)!) : null,
    p90Min: minuten.length ? rund1(perzentil(minuten, 90)!) : null,
  };

  // Rückfragen
  const rueck = vom("RUECKFRAGE");
  const mitRueck = vorgaenge.filter((v) => v.runde > 0).length;
  const rueckfragen = {
    anzahl: rueck.length,
    vorgaengeMitRueckfrage: mitRueck,
    quoteProzent: prozent(mitRueck, vorgaenge.length),
    maxRunde: vorgaenge.reduce((m, v) => Math.max(m, v.runde), 0),
  };

  // Fassungen je Angebot (über die Dokumentnummer)
  const maxVersion = new Map<string, number>();
  for (const d of dokumente) maxVersion.set(d.nummer, Math.max(maxVersion.get(d.nummer) ?? 0, d.version));
  const angebote = maxVersion.size;
  const mitKorrektur = [...maxVersion.values()].filter((v) => v >= 2).length;
  const fassungen = {
    angebote,
    mitKorrektur,
    quoteProzent: prozent(mitKorrektur, angebote),
    schnittFassungen: angebote ? rund1([...maxVersion.values()].reduce((s, v) => s + v, 0) / angebote) : null,
  };

  // Knöpfe der Fertigmeldung
  const kn = vom("ANGEBOT_KNOPF");
  const knoepfe = {
    raumWeiter: kn.filter((e) => daten(e).knopf === "raum_weiter").length,
    korrigieren: kn.filter((e) => daten(e).knopf === "korrigieren").length,
  };

  // Geöffnete Links
  const li = vom("LINK_GEOEFFNET");
  const zaehle = (schluessel: string) => {
    const r: Record<string, number> = {};
    for (const e of li) {
      const w = String(daten(e)[schluessel] ?? "unbekannt");
      r[w] = (r[w] ?? 0) + 1;
    }
    return r;
  };
  const links = { gesamt: li.length, jeZiel: zaehle("ziel"), jeGeraet: zaehle("geraet") };

  // Wandfotos
  const wf = vom("WANDFOTO");
  const wandfotos = {
    anzahl: wf.length,
    komplettProzent: prozent(wf.filter((e) => daten(e).komplett === true).length, wf.length),
    nachfassenProzent: prozent(wf.filter((e) => daten(e).nachfassen === true).length, wf.length),
  };

  return { nachrichten, vorgaenge: vorg, zeitBisAngebot, rueckfragen, fassungen, knoepfe, links, wandfotos };
}

/** Event-Typen, die die Auswertung braucht (für die Datenbankabfrage). */
export const KENNZAHL_EVENT_TYPEN = [
  "NACHRICHT_EMPFANGEN",
  "NACHRICHT_BLOCKIERT",
  "AUSWERTUNG_UEBERHOLT",
  "RUECKFRAGE",
  "ANGEBOT_KNOPF",
  "LINK_GEOEFFNET",
  "WANDFOTO",
] as const;
