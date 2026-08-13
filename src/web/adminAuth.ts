// Login für das Betreiber-Cockpit (/stasi) — E-Mail + Passwort statt Token-URL.
//
// Warum: Der ADMIN_TOKEN in der URL landet in Browser-Verlauf, Lesezeichen und
// Screenshots. Neuer Weg: klassischer Login, danach ein signiertes
// httpOnly-Cookie (30 Tage). Der unauffällige Pfad /stasi ist bewusst gewählt
// (schwerer zu erraten) — die eigentliche Sicherheit kommt vom Login.
// Der alte Token-Weg /admin/<ADMIN_TOKEN>/… bleibt als Notfall-Zugang bestehen.
//
// Zugangsdaten in der Server-.env (fehlt eines, ist der Login komplett aus — fail closed):
//   ADMIN_EMAIL=du@deine-mail.de
//   ADMIN_PASSWORT_HASH=scrypt.<salt>.<hash>
// Hash erzeugen: npx tsx src/stasi-passwort.ts "MeinPasswort"
// Passwort-Hash: scrypt (Node-Bordmittel), Vergleich timing-sicher; Brute-Force-
// Schutz über denselben Versuchszähler wie die Zugangs-Schleuse (5 → 15 Min).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { zugangGesperrt, merkeFehlversuch, setzeVersucheZurueck } from "./geraetevertrauen.js";

const COOKIE_NAME = "ab_stasi";
const GUELTIG_TAGE = 30;
const SPERR_SCHLUESSEL = "stasi-login"; // ein gemeinsamer Zähler für alle Login-Versuche

// ── Passwort-Hash (scrypt) ────────────────────────────────
export function passwortHashErzeugen(passwort: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(passwort, salt, 64).toString("base64url");
  return `scrypt.${salt}.${hash}`;
}

export function passwortOk(passwort: string, gespeichert: string): boolean {
  const teile = gespeichert.split(".");
  if (teile.length !== 3 || teile[0] !== "scrypt") return false;
  const [, salt, hash] = teile as [string, string, string];
  const erwartet = Buffer.from(hash, "base64url");
  if (erwartet.length === 0) return false;
  const berechnet = scryptSync(passwort, salt, erwartet.length);
  return timingSafeEqual(berechnet, erwartet);
}

// ── Konfiguration aus der .env ────────────────────────────
function konfig(): { email: string; hash: string } | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORT_HASH?.trim();
  if (!email || !email.includes("@") || !hash?.startsWith("scrypt.")) return null;
  return { email, hash };
}

// ── Session-Cookie (signiert — gleiche Technik wie das Geräte-Vertrauen) ──
let bootGeheimnis: string | undefined;
function geheimnis(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (!bootGeheimnis) bootGeheimnis = randomBytes(32).toString("hex");
  return bootGeheimnis;
}

function signiere(basis: string): string {
  return createHmac("sha256", geheimnis()).update(basis).digest("base64url");
}

function leseCookie(req: FastifyRequest, name: string): string | undefined {
  const roh = req.headers.cookie;
  if (!roh) return undefined;
  for (const teil of roh.split(";")) {
    const gleich = teil.indexOf("=");
    if (gleich === -1) continue;
    if (teil.slice(0, gleich).trim() === name) return decodeURIComponent(teil.slice(gleich + 1).trim());
  }
  return undefined;
}

/** Hat dieser Browser eine gültige Admin-Sitzung (eingeloggt, nicht abgelaufen)? */
export function hatAdminSitzung(req: FastifyRequest): boolean {
  const wert = leseCookie(req, COOKIE_NAME);
  if (!wert) return false;
  const teile = wert.split(".");
  if (teile.length !== 3 || teile[0] !== "stasi") return false;
  const ablauf = Number(teile[1]);
  if (!Number.isFinite(ablauf) || Date.now() > ablauf) return false;
  const a = Buffer.from(teile[2] as string);
  const b = Buffer.from(signiere(`stasi.${teile[1]}`));
  return a.length === b.length && timingSafeEqual(a, b);
}

function setzeSitzung(reply: FastifyReply): void {
  const ablauf = Date.now() + GUELTIG_TAGE * 24 * 60 * 60 * 1000;
  const basis = `stasi.${ablauf}`;
  const wert = `${basis}.${signiere(basis)}`;
  const teile = [
    `${COOKIE_NAME}=${encodeURIComponent(wert)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${GUELTIG_TAGE * 24 * 60 * 60}`,
  ];
  if (process.env.BASE_URL?.startsWith("https://")) teile.push("Secure");
  reply.header("set-cookie", teile.join("; "));
}

function loescheSitzung(reply: FastifyReply): void {
  reply.header("set-cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function nichtGefunden(): string {
  return `<!doctype html><meta charset="utf-8"><title>Nicht gefunden</title>
    <body style="font-family:sans-serif;text-align:center;padding:60px;color:#555;">
    <h1 style="color:#0b5cad;">AuftragsBoss</h1>
    <p>Dieser Link ist ungültig oder abgelaufen.</p></body>`;
}

/** Schlichte Login-Seite — selbsttragend, gleiche Ruhe wie die Zugangs-Schleuse. */
function loginSeite(): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Anmelden · AuftragsBoss</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#22262a; color:#1a1a1a; }
  .karte { background:#fff; border-radius:14px; padding:30px 28px; width:min(380px, calc(100vw - 32px));
           box-shadow:0 18px 50px rgba(0,0,0,.4); }
  h1 { margin:0 0 4px; font-size:20px; color:#0b5cad; }
  p.unter { margin:0 0 18px; font-size:13.5px; color:#667; }
  label { display:block; font-size:13px; font-weight:600; color:#555; margin:12px 0 4px; }
  input { width:100%; padding:11px 12px; border:1px solid #cfd4da; border-radius:8px; font-size:15px; }
  input:focus { outline:2px solid #0b5cad; border-color:#0b5cad; }
  button { width:100%; margin-top:18px; padding:12px; border:none; border-radius:8px; background:#0b5cad;
           color:#fff; font-size:15px; font-weight:700; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  button:disabled { opacity:.6; cursor:default; }
  .fehler { margin-top:12px; font-size:13.5px; color:#c0392b; min-height:18px; }
</style>
</head>
<body>
<form class="karte" id="f">
  <h1>AuftragsBoss</h1>
  <p class="unter">Betreiber-Zugang — bitte anmelden.</p>
  <label for="email">E-Mail</label>
  <input id="email" type="email" inputmode="email" autocomplete="username" required autofocus>
  <label for="passwort">Passwort</label>
  <input id="passwort" type="password" autocomplete="current-password" required>
  <button id="knopf" type="submit">Anmelden</button>
  <div class="fehler" id="fehler"></div>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const knopf=document.getElementById('knopf'), fehler=document.getElementById('fehler');
  knopf.disabled=true; fehler.textContent='';
  try{
    const r=await fetch('/stasi/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:document.getElementById('email').value,passwort:document.getElementById('passwort').value})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.fehler||'Anmeldung fehlgeschlagen.');
    window.location.href='/stasi/betriebe';
    return;
  }catch(err){ fehler.textContent=err.message; }
  knopf.disabled=false;
});
</script>
</body>
</html>`;
}

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  // Login-Seite; mit gültiger Sitzung direkt weiter ins Cockpit.
  app.get("/stasi", async (req, reply) => {
    if (!konfig()) return reply.code(404).type("text/html").send(nichtGefunden());
    if (hatAdminSitzung(req)) return reply.redirect("/stasi/betriebe");
    return reply.type("text/html; charset=utf-8").send(loginSeite());
  });

  app.post<{ Body: { email?: string; passwort?: string } }>("/stasi/login", async (req, reply) => {
    const k = konfig();
    if (!k) return reply.code(404).send({ fehler: "nicht verfügbar" });

    const sperre = zugangGesperrt(SPERR_SCHLUESSEL);
    if (sperre.gesperrt) {
      return reply.code(429).send({ fehler: `Zu viele Versuche. Bitte ${Math.ceil(sperre.sekunden / 60)} Min. warten.` });
    }

    const email = (req.body?.email ?? "").trim().toLowerCase();
    const passwort = req.body?.passwort ?? "";
    // Passwort-Prüfung IMMER ausführen (auch bei falscher E-Mail) — sonst
    // verrät die Antwortzeit, ob die E-Mail stimmt.
    const passwortStimmt = passwortOk(passwort, k.hash);
    if (email !== k.email || !passwortStimmt) {
      merkeFehlversuch(SPERR_SCHLUESSEL);
      return reply.code(401).send({ fehler: "E-Mail oder Passwort falsch." });
    }

    setzeVersucheZurueck(SPERR_SCHLUESSEL);
    setzeSitzung(reply);
    return reply.send({ ok: true });
  });

  app.get("/stasi/abmelden", async (_req, reply) => {
    loescheSitzung(reply);
    return reply.redirect("/stasi");
  });
}
