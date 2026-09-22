// SalesFrank-Webhook verarbeiten: Gespräch bewerten, bei klarer Zustimmung die
// WhatsApp-Einladung senden (wie „Telefon-Lead einladen" im Cockpit), sonst zur
// Prüfung ablegen. Jeder Anruf wird einmal als SalesFrankAnruf gespeichert
// (Zusammenfassung + Beleg-Zitat als Nachweis der Einwilligung); Absagen ohne
// Nummer und ohne Transkript (Datenminimierung).
import type { PrismaClient } from "@prisma/client";
import { normalisiereHandy } from "../config.js";
import { legeLeadAnUndLadeEin, type LeadSender } from "../lead/onboarding.js";
import { maskiereNummer } from "../whatsapp/maskierung.js";
import { bewerteGespraech, entscheide, type Bewerter, type Einschaetzung } from "./auswertung.js";

export interface AnrufPayload {
  callId: string;
  telefon: string;
  name: string;
  firma: string;
  anrede: string;
  ergebnis: string;
  zusammenfassung: string;
  transkript: string;
}

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Tolerantes Auslesen des Webhook-Bodys. SalesFrank erlaubt ein frei definiertes
 * JSON mit Platzhaltern; wir akzeptieren die von uns vorgegebene Vorlage und
 * naheliegende Varianten (flach, custom_variables, andere Feldnamen).
 */
export function liesPayload(body: unknown): AnrufPayload | null {
  // Manche Anbieter packen alles in „data"; sonst der Body selbst.
  const b = { ...obj(obj(body).data), ...obj(body) };
  const call = { ...obj(b.call), ...obj(b.call_data) };
  const lead = obj(b.lead);
  const vars = { ...obj(b.variables), ...obj(lead.custom_variables), ...obj(lead.custom), ...obj(b.custom_variables) };
  const callId = s(call.id) || s(b.call_id) || s(b.callId) || s(b.id);
  if (!callId) return null;
  const vorname = s(lead.first_name), nachname = s(lead.surname ?? lead.last_name);
  return {
    callId,
    telefon: s(lead.phone) || s(lead.phone_number) || s(b.phone) || s(b.phone_number),
    name: s(lead.name) || [vorname, nachname].filter(Boolean).join(" "),
    firma: s(lead.company) || s(lead.company_name) || s(vars.firma) || s(b.company) || s(b.company_name),
    anrede: s(vars.anrede) || s(lead.anrede),
    ergebnis: [s(call.outcome), s(call.reach), s(call.result)].filter(Boolean).join(" / "),
    zusammenfassung: s(call.summary) || s(b.summary),
    transkript: s(call.transcript) || s(b.transcript),
  };
}

export type AnrufStatus = "EINGELADEN" | "PRUEFUNG" | "ABGELEHNT" | "KEIN_GESPRAECH" | "SCHON_VORHANDEN" | "FEHLER" | "VERWORFEN";

/** SalesFrank-Ergebnisse, bei denen kein Mensch dran war: gar nicht erst bewerten (keine KI-Kosten, kein Eintrag). */
export const OHNE_GESPRAECH = /machine|voicemail|mailbox|no[_ -]?answer|busy|failed|unreach|not[_ -]?reached|canceled|cancelled/i;

/** Begründungen früherer Prüffälle, die in Wahrheit kein Gespräch waren (Aufräumen). */
export const KEIN_GESPRAECH_MUSTER = /anrufbeantworter|mailbox|voicemail|ansage|brach\s|bricht\s|abgebrochen|endet direkt|rückruf|zurückrufen|nicht passt|passt gerade|keine zeit|nur mit dem firmennamen|nicht lesbar|unverständlich|vermittlungsdienst|goodbye|falsch gewählte|nach der begrüßung|nach der einstiegsfrage|nur nachgefragt|nur mit „genau|fragmente/i;

export interface VerarbeitungsErgebnis {
  aktion: "ignoriert" | "doppelt" | "kein-gespraech" | AnrufStatus;
  detail?: string;
  id?: string;
}

const istHandy = (nummer: string) => /^49(15|16|17)\d{7,}$/.test(nummer);

export async function verarbeiteSalesFrankAnruf(
  prisma: PrismaClient,
  p: AnrufPayload,
  deps: { bewerte?: Bewerter; sender?: LeadSender } = {},
): Promise<VerarbeitungsErgebnis> {
  const bewerte = deps.bewerte ?? bewerteGespraech;
  if (!p.callId) return { aktion: "ignoriert", detail: "ohne call.id" };
  if (await prisma.salesFrankAnruf.findUnique({ where: { callId: p.callId } })) return { aktion: "doppelt", detail: p.callId };
  if (!p.transkript && !p.zusammenfassung) return { aktion: "kein-gespraech", detail: p.ergebnis || "ohne Inhalt" };
  if (OHNE_GESPRAECH.test(p.ergebnis)) return { aktion: "kein-gespraech", detail: p.ergebnis };

  const e: Einschaetzung = await bewerte({ transkript: p.transkript, zusammenfassung: p.zusammenfassung, ergebnis: p.ergebnis, name: p.name, firma: p.firma });
  const entscheidung = entscheide(e);
  const anrede = (p.anrede || e.anrede || p.firma || p.name).trim();
  const nummer = normalisiereHandy(e.handynummer ?? p.telefon) ?? normalisiereHandy(p.telefon);
  const basis = {
    callId: p.callId,
    nummerMaskiert: nummer ? maskiereNummer(nummer) : "?",
    name: p.name,
    firma: p.firma,
    anrede,
    einschaetzung: entscheidung === "EINLADEN" ? "JA" : entscheidung === "ABLEHNEN" ? "NEIN" : entscheidung === "KEIN_GESPRAECH" ? e.gespraechsart : "UNKLAR",
    begruendung: e.begruendung,
    zusammenfassung: p.zusammenfassung,
    beleg: e.beleg,
  };

  let status: AnrufStatus;
  let detail = "";
  let handwerkerId: string | null = null;
  let nummerSpeichern: string | null = nummer;
  let transkript = p.transkript;

  if (entscheidung === "ABLEHNEN" || entscheidung === "KEIN_GESPRAECH") {
    status = entscheidung === "ABLEHNEN" ? "ABGELEHNT" : "KEIN_GESPRAECH";
    detail = e.begruendung;
    nummerSpeichern = null;
    transkript = "";
  } else {
    const vorhanden = nummer ? await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer }, select: { id: true, firma: true, name: true } }) : null;
    if (vorhanden) {
      status = "SCHON_VORHANDEN";
      detail = `Nummer gehört schon zu ${vorhanden.firma || vorhanden.name || "einem Betrieb"}`;
      handwerkerId = vorhanden.id;
      nummerSpeichern = null;
    } else if (entscheidung === "PRUEFUNG") {
      status = "PRUEFUNG";
      detail = e.begruendung;
    } else if (!nummer || !istHandy(nummer)) {
      status = "PRUEFUNG";
      detail = `Zustimmung erkannt, aber keine Handynummer (${nummer ? maskiereNummer(nummer) : "keine Nummer"}). Bitte Handynummer erfragen und dann einladen.`;
    } else {
      const erg = await legeLeadAnUndLadeEin(prisma, { nummer, anrede, firma: p.firma, optInQuelle: `salesfrank:${p.callId}`, leadQuelle: "TELEFON" }, deps.sender);
      if ("handwerker" in erg) {
        status = "EINGELADEN";
        handwerkerId = erg.handwerker.id;
        detail = `Einladung an ${maskiereNummer(nummer)} gesendet`;
      } else {
        status = "FEHLER";
        detail = erg.fehler;
      }
    }
  }

  const rec = await prisma.salesFrankAnruf.create({
    data: { ...basis, status, nummer: nummerSpeichern, transkript, handwerkerId, erledigtAm: status === "PRUEFUNG" || status === "FEHLER" ? null : new Date() },
  });
  await prisma.adminLog.create({
    data: { aktion: `SALESFRANK_${status}`, handwerkerId, betrieb: p.firma || p.name || null, detail: `${detail} (Anruf ${p.callId})`.trim() },
  });
  return { aktion: status, detail, id: rec.id };
}

/** Betreiber lädt einen zur Prüfung abgelegten Anruf von Hand ein (nach eigener Prüfung des Belegs). */
export async function ladeSalesFrankAnrufEin(
  prisma: PrismaClient,
  id: string,
  args: { nummer?: string; anrede?: string } = {},
  sender?: LeadSender,
): Promise<{ ok: true; meldung: string } | { ok: false; fehler: string }> {
  const a = await prisma.salesFrankAnruf.findUnique({ where: { id } });
  if (!a) return { ok: false, fehler: "Anruf nicht gefunden" };
  if (a.status !== "PRUEFUNG" && a.status !== "FEHLER") return { ok: false, fehler: `Anruf ist schon ${a.status.toLowerCase()}` };
  const nummer = normalisiereHandy(args.nummer || a.nummer || "");
  if (!nummer || !istHandy(nummer)) return { ok: false, fehler: "Bitte eine gültige Handynummer angeben." };
  const anrede = (args.anrede || a.anrede).trim();
  const erg = await legeLeadAnUndLadeEin(prisma, { nummer, anrede, firma: a.firma, optInQuelle: `salesfrank:${a.callId}:manuell`, leadQuelle: "TELEFON" }, sender);
  if ("fehler" in erg) return { ok: false, fehler: erg.fehler };
  await prisma.salesFrankAnruf.update({ where: { id }, data: { status: "EINGELADEN", nummer, anrede, handwerkerId: erg.handwerker.id, erledigtAm: new Date() } });
  await prisma.adminLog.create({ data: { aktion: "SALESFRANK_EINGELADEN", handwerkerId: erg.handwerker.id, betrieb: a.firma || a.name || null, detail: `Von Hand nach Prüfung eingeladen (Anruf ${a.callId})` } });
  return { ok: true, meldung: `Einladung an ${maskiereNummer(nummer)} gesendet.` };
}

/** Prüffälle, die laut Begründung kein Gespräch waren (Mailbox, Abbruch, Rückrufwunsch), auf KEIN_GESPRAECH setzen. */
export async function raeumeSalesFrankPruefungAuf(prisma: PrismaClient): Promise<number> {
  const offen = await prisma.salesFrankAnruf.findMany({ where: { status: "PRUEFUNG" }, select: { id: true, begruendung: true, beleg: true } });
  let n = 0;
  for (const a of offen) {
    if (a.beleg.trim() || !KEIN_GESPRAECH_MUSTER.test(a.begruendung)) continue;
    await prisma.salesFrankAnruf.update({ where: { id: a.id }, data: { status: "KEIN_GESPRAECH", nummer: null, transkript: "", erledigtAm: new Date() } });
    n++;
  }
  if (n) await prisma.adminLog.create({ data: { aktion: "SALESFRANK_AUFGERAEUMT", handwerkerId: null, betrieb: null, detail: `${n} Prüffälle ohne Gespräch (Mailbox, Abbruch, Rückruf) geschlossen` } });
  return n;
}

/** Betreiber verwirft einen Anruf: Nummer und Transkript werden entfernt, der Eintrag bleibt als Spur. */
export async function verwerfeSalesFrankAnruf(prisma: PrismaClient, id: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const a = await prisma.salesFrankAnruf.findUnique({ where: { id } });
  if (!a) return { ok: false, fehler: "Anruf nicht gefunden" };
  if (a.status !== "PRUEFUNG" && a.status !== "FEHLER") return { ok: false, fehler: `Anruf ist schon ${a.status.toLowerCase()}` };
  await prisma.salesFrankAnruf.update({ where: { id }, data: { status: "VERWORFEN", nummer: null, transkript: "", erledigtAm: new Date() } });
  await prisma.adminLog.create({ data: { aktion: "SALESFRANK_VERWORFEN", handwerkerId: null, betrieb: a.firma || a.name || null, detail: `Verworfen (Anruf ${a.callId})` } });
  return { ok: true };
}
