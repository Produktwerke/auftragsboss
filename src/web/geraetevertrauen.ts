// Geräte-Vertrauen für den E-Mail-/Editor-Zugang (Stufe A / A2).
//
// Problem: Der Bearbeiten-Link (…/a/<token>) landet nicht nur im privaten
// WhatsApp-Chat, sondern auch in einer E-Mail — und E-Mails werden weiter-
// geleitet oder liegen in fremd zugänglichen Postfächern. Der Token allein
// genügt dann nicht mehr als Zugangsschutz.
//
// Lösung ohne Login/Passwort: Beim ERSTEN Öffnen auf einem Gerät fragt eine
// Schleuse nach der Handynummer und vergleicht sie mit der hinterlegten
// WhatsApp-Nummer des Betriebs. Stimmt sie, bekommt der Browser ein
// langlebiges, signiertes Cookie ("dieses Gerät ist vertraut") — und ab dann
// öffnet dieses Gerät die Angebote OHNE weitere Nachfrage. Einmalig, nicht
// jedes Mal.
//
// Test-Konten (istTest) werden NIE geschleust — der öffentliche "Live testen"-
// Weg muss reibungslos bleiben.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const COOKIE_NAME = "ab_geraet";
const GUELTIG_TAGE = 180;

// Geheimnis zum Signieren der Cookies. Idealerweise SESSION_SECRET in der .env
// (stabil über Neustarts). Fehlt es, wird ein temporäres pro Serverstart
// erzeugt — dann funktioniert alles weiter, nur überlebt das Geräte-Vertrauen
// keinen Neustart (die Nutzer müssten sich nach einem Deploy einmal neu
// ausweisen). Deshalb: SESSION_SECRET setzen.
let bootGeheimnis: string | undefined;
function geheimnis(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (!bootGeheimnis) {
    bootGeheimnis = randomBytes(32).toString("hex");
    console.warn(
      "⚠️  SESSION_SECRET fehlt/zu kurz — nutze ein temporäres Geheimnis. " +
        "Das Geräte-Vertrauen überlebt keinen Neustart. Bitte SESSION_SECRET in .env setzen.",
    );
  }
  return bootGeheimnis;
}

function signiere(basis: string): string {
  return createHmac("sha256", geheimnis()).update(basis).digest("base64url");
}

/** Baut den signierten Cookie-Wert: handwerkerId.ablaufMs.signatur */
function baueWert(handwerkerId: string): string {
  const ablauf = Date.now() + GUELTIG_TAGE * 24 * 60 * 60 * 1000;
  const basis = `${handwerkerId}.${ablauf}`;
  return `${basis}.${signiere(basis)}`;
}

/** Prüft einen Cookie-Wert gegen die erwartete handwerkerId (Signatur + Ablauf). */
function pruefeWert(wert: string | undefined, handwerkerId: string): boolean {
  if (!wert) return false;
  const teile = wert.split(".");
  if (teile.length !== 3) return false;
  const [id, ablaufStr, sig] = teile as [string, string, string];
  if (id !== handwerkerId) return false;
  const ablauf = Number(ablaufStr);
  if (!Number.isFinite(ablauf) || Date.now() > ablauf) return false;
  const erwartet = signiere(`${id}.${ablaufStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function leseCookie(req: FastifyRequest, name: string): string | undefined {
  const roh = req.headers.cookie;
  if (!roh) return undefined;
  for (const teil of roh.split(";")) {
    const gleich = teil.indexOf("=");
    if (gleich === -1) continue;
    const k = teil.slice(0, gleich).trim();
    if (k === name) return decodeURIComponent(teil.slice(gleich + 1).trim());
  }
  return undefined;
}

/** Hat dieser Browser bereits ein gültiges Vertrauens-Cookie für den Betrieb? */
export function hatGeraetevertrauen(req: FastifyRequest, handwerkerId: string): boolean {
  return pruefeWert(leseCookie(req, COOKIE_NAME), handwerkerId);
}

/** Setzt das langlebige Vertrauens-Cookie nach erfolgreicher Identifikation. */
export function setzeGeraetevertrauen(reply: FastifyReply, handwerkerId: string): void {
  const wert = baueWert(handwerkerId);
  const maxAge = GUELTIG_TAGE * 24 * 60 * 60;
  const teile = [
    `${COOKIE_NAME}=${encodeURIComponent(wert)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  // Secure nur unter HTTPS (in Produktion via BASE_URL erkannt); lokal ohne,
  // damit das Testen über http://localhost funktioniert.
  if (process.env.BASE_URL?.startsWith("https://")) teile.push("Secure");
  reply.header("set-cookie", teile.join("; "));
}

/**
 * Darf dieser Request das Angebot sehen/ändern? True bei Test-Konto (nie
 * schleusen) oder wenn das Gerät bereits vertraut ist.
 */
export function darfZugreifen(req: FastifyRequest, handwerkerId: string, istTest: boolean): boolean {
  return istTest || hatGeraetevertrauen(req, handwerkerId);
}

/**
 * Vergleicht die eingegebene Nummer mit der hinterlegten WhatsApp-Nummer.
 * Normalisiert tolerant: Leerzeichen/Klammern/Bindestriche raus, Ländervorwahl
 * (0049 / +49 / 49) und führende 0 vereinheitlicht — "0174 936 4823",
 * "+49 174 9364823" und "491749364823" gelten als dieselbe Nummer.
 */
export function nummerPasst(eingabe: string, hinterlegt: string): boolean {
  const norm = (s: string): string => {
    let d = (s ?? "").replace(/\D/g, "");
    if (d.startsWith("0049")) d = d.slice(4);
    else if (d.startsWith("49") && d.length > 10) d = d.slice(2);
    else if (d.startsWith("0")) d = d.slice(1);
    return d;
  };
  const a = norm(eingabe);
  const b = norm(hinterlegt);
  return a.length >= 6 && a === b;
}

// ── Einfacher Missbrauchsschutz gegen Durchprobieren (im Arbeitsspeicher) ──
// Nach zu vielen Fehlversuchen für einen Token wird die Schleuse kurz gesperrt.
const MAX_VERSUCHE = 5;
const SPERRE_MINUTEN = 15;
const versuche = new Map<string, { anzahl: number; sperreBis: number }>();

/** Gibt zurück, ob (noch) Versuche erlaubt sind — und ggf. bis wann gesperrt. */
export function zugangGesperrt(token: string): { gesperrt: boolean; sekunden: number } {
  const e = versuche.get(token);
  if (e && e.sperreBis > Date.now()) {
    return { gesperrt: true, sekunden: Math.ceil((e.sperreBis - Date.now()) / 1000) };
  }
  return { gesperrt: false, sekunden: 0 };
}

/** Zählt einen Fehlversuch; sperrt bei Überschreiten der Grenze. */
export function merkeFehlversuch(token: string): void {
  const e = versuche.get(token) ?? { anzahl: 0, sperreBis: 0 };
  e.anzahl += 1;
  if (e.anzahl >= MAX_VERSUCHE) {
    e.sperreBis = Date.now() + SPERRE_MINUTEN * 60 * 1000;
    e.anzahl = 0;
  }
  versuche.set(token, e);
}

/** Setzt die Fehlversuche nach erfolgreicher Identifikation zurück. */
export function setzeVersucheZurueck(token: string): void {
  versuche.delete(token);
}
