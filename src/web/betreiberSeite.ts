import { jsonInsSkript } from "./jsonInsSkript.js";
import { EMPFEHLUNGS_PRAEMIE_EUR } from "../empfehlung.js";
// Betreiber-Cockpit (Stufe 1): Kundenliste + Kundendetail mit Verwaltungs-
// Aktionen (Kontakt ändern, blockieren, Gutschrift, löschen) und Usage-Zahlen.
// Nur intern erreichbar über /admin/:ADMIN_TOKEN/betriebe (siehe betreiberRoutes.ts).
// Reine Render-Funktionen ohne Prisma-Abhängigkeit — die Routen liefern die Daten.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const datumZeitDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
  " " +
  d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const euroDE = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Gemeinsamer Kopf/Stil — bewusst dieselbe Optik wie die Lern-Auswertung. */
function seite(titel: string, inhalt: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AuftragsBoss · ${escapeHtml(titel)}</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#eef0f3; color:#1a1a1a; line-height:1.5; }
  .rahmen { max-width:1060px; margin:0 auto; padding:16px; }
  h1 { font-size:22px; margin:8px 2px 2px; }
  h2 { font-size:16px; margin:22px 2px 8px; }
  .unter { color:#666; font-size:14px; margin:0 2px 16px; }
  a { color:#0b5cad; }
  .kennz { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  .kachel { background:#fff; border-radius:10px; padding:12px 16px; box-shadow:0 1px 4px rgba(0,0,0,.07); flex:1; min-width:130px; }
  .kachel .wert { font-size:24px; font-weight:700; color:#0b5cad; }
  .kachel .lab { font-size:12.5px; color:#666; }
  .karte { background:#fff; border-radius:12px; padding:16px 18px; margin-bottom:14px; box-shadow:0 1px 4px rgba(0,0,0,.07); }
  table.liste { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; box-shadow:0 1px 4px rgba(0,0,0,.07); overflow:hidden; }
  table.liste th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#8a9099; padding:10px 12px; border-bottom:1px solid #e4e7eb; background:#fafbfc; }
  table.liste td { padding:10px 12px; border-bottom:1px solid #f0f2f4; font-size:14px; vertical-align:top; }
  table.liste tr:last-child td { border-bottom:0; }
  .badge { display:inline-block; font-size:12px; font-weight:600; padding:2px 9px; border-radius:20px; white-space:nowrap; }
  .b-aktiv { background:#eef7ee; color:#2e7d32; }
  .b-test { background:#e8f0fa; color:#0b5cad; }
  .b-block { background:#fdecea; color:#c62828; }
  .b-inaktiv { background:#fff3e0; color:#b7791f; }
  .b-neutral { background:#eef0f3; color:#555; }
  .filter { margin:0 0 14px; display:flex; gap:8px; flex-wrap:wrap; font-size:13.5px; }
  .filter a { text-decoration:none; padding:5px 12px; border-radius:20px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.06); color:#444; }
  .filter a.an { background:#0b5cad; color:#fff; }
  form.inline { display:inline-flex; align-items:center; gap:8px; margin-left:8px; }
  form.inline .meldung { margin:0; }
  form.zeile { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  label.feld { display:block; font-size:12.5px; color:#555; }
  label.feld input, label.feld select { display:block; margin-top:3px; padding:8px 10px; border:1px solid #cdd3da; border-radius:8px; font-size:14px; width:220px; max-width:100%; }
  label.feld input[type=number] { width:110px; }
  button.kn { background:#0b5cad; color:#fff; border:0; border-radius:8px; padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer; }
  button.kn:hover { filter:brightness(1.08); }
  button.kn.warn { background:#b7791f; }
  button.kn.rot { background:#c62828; }
  button.kn.grau { background:#5a616b; }
  .hinweis { font-size:12.5px; color:#888; margin-top:6px; }
  .meldung { display:none; margin:8px 0 0; font-size:13.5px; padding:8px 12px; border-radius:8px; }
  .meldung.ok { display:block; background:#eef7ee; color:#2e7d32; }
  .meldung.fehler { display:block; background:#fdecea; color:#c62828; }
  ul.log { list-style:none; margin:0; padding:0; }
  ul.log li { font-size:13px; padding:6px 0; border-bottom:1px solid #f0f2f4; }
  ul.log li:last-child { border-bottom:0; }
  ul.log .zeit { color:#999; font-size:12px; margin-right:8px; white-space:nowrap; }
  ul.log .akt { font-weight:600; color:#0b5cad; margin-right:6px; }
  .kopfzeile { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
  .zurueck { font-size:13.5px; }
  .tabellenrahmen { overflow-x:auto; }
  @media (max-width:700px){ label.feld input { width:100%; } table.liste { min-width:680px; } }
</style>
</head>
<body>
<div class="rahmen">
${inhalt}
</div>
<script>
  // Alle Aktions-Formulare posten JSON und zeigen das Ergebnis inline an.
  document.querySelectorAll("form[data-post]").forEach(function (f) {
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var frage = f.getAttribute("data-frage");
      if (frage && !confirm(frage)) return;
      var daten = {};
      new FormData(f).forEach(function (w, k) { daten[k] = w; });
      var m = f.querySelector(".meldung");
      try {
        var r = await fetch(f.getAttribute("data-post"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(daten),
        });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.fehler || ("Fehler " + r.status));
        var ziel = f.getAttribute("data-ziel");
        if (ziel) { window.location.href = ziel; return; }
        if (m) { m.className = "meldung ok"; m.textContent = j.meldung || "Gespeichert."; }
        setTimeout(function () { window.location.reload(); }, 700);
      } catch (err) {
        if (m) { m.className = "meldung fehler"; m.textContent = err.message; }
      }
    });
  });
</script>
</body>
</html>`;
}

// ── Kundenliste ─────────────────────────────────────────────────────────────

export interface BetriebZeile {
  id: string;
  firma: string;
  name: string;
  whatsappNummer: string;
  email: string;
  istTest: boolean;
  blockiert: boolean;
  erstelltAm: Date;
  /** Offenes Konto-Guthaben in Euro (Empfehlungsprämie, Kulanz), bei der nächsten Zahlung zu verrechnen. */
  guthabenEuro: number;
  angebote: number;
  letzteAktivitaet: Date | null;
  /** Abrechnung (Stufe 2): aktueller Tarif (null = kein Abo) + Umsatz aus dem Ledger. */
  tarif: string | null;
  aboStatus: string | null;
  umsatz: number;
}

export type BetriebsFilter = "alle" | "kunden" | "test" | "blockiert" | "inaktiv";

export const INAKTIV_TAGE = 7;

export function istInaktiv(z: { letzteAktivitaet: Date | null; erstelltAm: Date }, jetzt = new Date()): boolean {
  const letzte = z.letzteAktivitaet ?? z.erstelltAm;
  return jetzt.getTime() - letzte.getTime() > INAKTIV_TAGE * 24 * 60 * 60 * 1000;
}

function statusBadge(z: BetriebZeile): string {
  if (z.blockiert) return `<span class="badge b-block">blockiert</span>`;
  if (z.istTest) return `<span class="badge b-test">Test</span>`;
  if (istInaktiv(z)) return `<span class="badge b-inaktiv">inaktiv ${INAKTIV_TAGE}+ Tage</span>`;
  return `<span class="badge b-aktiv">aktiv</span>`;
}

function tarifBadge(z: { tarif: string | null; aboStatus: string | null }): string {
  if (!z.tarif) return `<span class="badge b-neutral">kein Abo</span>`;
  const gek = z.aboStatus === "GEKUENDIGT" ? ` <span class="badge b-inaktiv">gekündigt</span>` : "";
  return `<span class="badge b-test">${escapeHtml(z.tarif)}</span>${gek}`;
}

export interface Alarme {
  inaktiveKunden: Array<{ id: string; firma: string; tage: number }>;
  testAmLimit: Array<{ id: string; firma: string; nachrichten: number; limit: number }>;
  rueckfragen: Array<{ id: string; firma: string; nummer: string; datum: Date }>;
}

function alarmBox(basis: string, a: Alarme): string {
  const zeilen: string[] = [];
  for (const k of a.inaktiveKunden) {
    zeilen.push(
      `<li>💤 <a href="${basis}/betrieb/${k.id}"><b>${escapeHtml(k.firma)}</b></a> ist seit ${k.tage} Tagen inaktiv — anrufen?</li>`,
    );
  }
  for (const t of a.testAmLimit) {
    zeilen.push(
      `<li>🧪 Test-Konto <a href="${basis}/betrieb/${t.id}"><b>${escapeHtml(t.firma)}</b></a> am Limit (${t.nachrichten}/${t.limit} Nachrichten) — nachfassen und zum Abo einladen?</li>`,
    );
  }
  for (const r of a.rueckfragen) {
    zeilen.push(
      `<li>❓ Kundenrückfrage zu Angebot ${escapeHtml(r.nummer)} bei <a href="${basis}/betrieb/${r.id}"><b>${escapeHtml(r.firma)}</b></a> (${datumDE(r.datum)})</li>`,
    );
  }
  if (!zeilen.length) return "";
  return `<div class="karte" style="border-left:4px solid #b7791f;">
    <h2 style="margin:0 0 8px;">⚠️ Warnsignale</h2>
    <ul class="log">${zeilen.join("")}</ul>
  </div>`;
}

export function betreiberListe(args: {
  basis: string; // z.B. "/admin/<token>"
  filter: BetriebsFilter;
  zeilen: BetriebZeile[];
  kpis: {
    gesamt: number;
    kunden: number;
    test: number;
    blockiert: number;
    angeboteGesamt: number;
    angebote7Tage: number;
    mrr: number;
    einnahmenMonat: number;
    gesamtUmsatz: number;
    kiKostenMonatCent: number;
  };
  alarme: Alarme;
}): string {
  const { basis, filter, zeilen, kpis, alarme } = args;

  const filterLink = (f: BetriebsFilter, label: string) =>
    `<a class="${filter === f ? "an" : ""}" href="${basis}/betriebe?filter=${f}">${label}</a>`;

  const zeilenHtml = zeilen
    .map(
      (z) => `<tr>
      <td><a href="${basis}/betrieb/${z.id}"><b>${escapeHtml(z.firma)}</b></a><br><span style="color:#888;font-size:12.5px;">${escapeHtml(z.name)}</span></td>
      <td>+${escapeHtml(z.whatsappNummer)}<br><span style="color:#888;font-size:12.5px;">${escapeHtml(z.email || "—")}</span></td>
      <td>${datumDE(z.erstelltAm)}</td>
      <td style="text-align:right;">${z.angebote}</td>
      <td>${z.letzteAktivitaet ? datumDE(z.letzteAktivitaet) : "—"}</td>
      <td>${tarifBadge(z)}</td>
      <td style="text-align:right;">${z.umsatz ? euroDE(z.umsatz) : "—"}</td>
      <td>${statusBadge(z)}</td>
    </tr>`,
    )
    .join("");

  return seite(
    "Kunden",
    `
  <h1>Kunden</h1>
  <p class="unter">Alle Betriebe mit Nutzung, Abo und Status. <a href="${basis}/umsatz">Zur Umsatz-Übersicht</a> · <a href="${basis === "/stasi" ? "/stasi/auswertung" : basis}">Zur Lern-Auswertung</a>${basis === "/stasi" ? ` · <a href="/stasi/abmelden">Abmelden</a>` : ""}</p>

  <div class="kennz">
    <div class="kachel"><div class="wert">${kpis.kunden}</div><div class="lab">Kunden</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.mrr)}</div><div class="lab">MRR (aktive Abos)</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.einnahmenMonat)}</div><div class="lab">Einnahmen, dieser Monat</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.gesamtUmsatz)}</div><div class="lab">Umsatz seit Start</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.kiKostenMonatCent / 100)}</div><div class="lab">KI-Kosten, dieser Monat</div></div>
    <div class="kachel"><div class="wert">${kpis.angebote7Tage}</div><div class="lab">Angebote, 7 Tage</div></div>
  </div>

  ${alarmBox(basis, alarme)}

  <div class="filter">
    ${filterLink("alle", `Alle (${kpis.gesamt})`)}
    ${filterLink("kunden", `Kunden (${kpis.kunden})`)}
    ${filterLink("test", `Test (${kpis.test})`)}
    ${filterLink("blockiert", `Blockiert (${kpis.blockiert})`)}
    ${filterLink("inaktiv", "Inaktiv")}
  </div>

  <div class="tabellenrahmen">
  <table class="liste">
    <thead><tr><th>Betrieb</th><th>Kontakt</th><th>Mitglied seit</th><th style="text-align:right;">Angebote</th><th>Letzte Aktivität</th><th>Abo</th><th style="text-align:right;">Umsatz</th><th>Status</th></tr></thead>
    <tbody>${zeilenHtml || `<tr><td colspan="8" style="text-align:center;color:#888;padding:26px;">Keine Betriebe für diesen Filter.</td></tr>`}</tbody>
  </table>
  </div>

  <div class="karte" style="margin-top:22px;">
    <h2 style="margin-top:0;">📞 Telefon-Lead einladen</h2>
    <p style="margin:0 0 12px;font-size:13.5px;color:#888;line-height:1.5;">
      Nach einem Telefonat mit <b>ausdrücklicher WhatsApp-Einwilligung</b>: Lead anlegen und die
      Einladungs-Vorlage mit den Antwort-Knöpfen senden. Der Interessent startet als Test-Konto
      mit dem üblichen Gratis-Kontingent.
    </p>
    <form class="zeile" data-post="${basis}/lead-einladen" data-frage="WhatsApp-Einladung an diese Nummer senden? Nur mit vorher erteilter Einwilligung!">
      <label class="feld">Handynummer
        <input name="nummer" required placeholder="z. B. 0176 1234567">
      </label>
      <label class="feld">Anrede (steht in der Nachricht)
        <input name="anrede" required minlength="2" placeholder="z. B. Herr Müller">
      </label>
      <label class="feld">Firma (optional)
        <input name="firma" placeholder="z. B. Malerbetrieb Müller">
      </label>
      <label class="feld">Einwilligung eingeholt durch
        <input name="quelle" value="telefonat">
      </label>
      <button type="submit">Einladung senden</button>
      <span class="meldung"></span>
    </form>
  </div>`,
  );
}

// ── Kundendetail ────────────────────────────────────────────────────────────

export interface AngebotZeile {
  nummer: string;
  datum: Date;
  brutto: number;
  anzahlOffen: number;
  versendet: boolean;
}

export interface AboInfo {
  tarif: string;
  monatspreis: number;
  status: string; // "AKTIV" | "GEKUENDIGT"
  beginntAm: Date;
  gekuendigtAm: Date | null;
}

export interface BuchungZeile {
  typ: string;
  betrag: number;
  zeitraum: string;
  notiz: string;
  erstelltAm: Date;
}

export interface LogZeile {
  aktion: string;
  detail: string;
  erstelltAm: Date;
}

export interface EmpfehlungZeile {
  id: string;
  firma: string;
  name: string;
  status: string;
  erstelltAm: Date;
}

export function betreiberDetail(args: {
  basis: string;
  betrieb: BetriebZeile & { blockiertGrund: string | null; blockiertAm: Date | null; gewerkTyp: string; ort: string | null; stripeGuthabenEuro?: number };
  usage: { versandbereit: number; offenePreise: number; versendet: number; protokolle: number };
  angebote: AngebotZeile[]; // die letzten N
  empfehlungen: EmpfehlungZeile[];
  logs: LogZeile[];
  /** Abrechnung (Stufe 2) */
  abo: AboInfo | null;
  buchungen: BuchungZeile[];
  aktuellerZeitraum: string; // "JJJJ-MM" für Vorbelegung
  tarifPresets: Record<string, number>;
  /** KI-Kosten (Stufe 3), in EUR-Cent. */
  kiKosten: { cent30Tage: number; centGesamt: number };
}): string {
  const { basis, betrieb: b, usage, angebote, empfehlungen, logs, abo, buchungen, aktuellerZeitraum, tarifPresets, kiKosten } = args;
  const aktion = (pfad: string) => `${basis}/betrieb/${b.id}/${pfad}`;

  const angeboteHtml = angebote
    .map((a) => {
      const status = a.versendet
        ? `<span class="badge b-aktiv">versendet</span>`
        : a.anzahlOffen > 0
          ? `<span class="badge b-inaktiv">${a.anzahlOffen} Preise offen</span>`
          : `<span class="badge b-test">versandbereit</span>`;
      return `<tr><td>${escapeHtml(a.nummer)}</td><td>${datumDE(a.datum)}</td><td style="text-align:right;">${euroDE(a.brutto)}</td><td>${status}</td></tr>`;
    })
    .join("");

  const empfehlungenHtml = empfehlungen
    .map(
      (e) =>
        `<li><span class="zeit">${datumDE(e.erstelltAm)}</span><b>${escapeHtml(e.firma)}</b> (${escapeHtml(e.name)}) — ${
          e.status === "AKTIVIERT"
            ? `<span class="badge b-aktiv">Kunde, Prämie ausgezahlt</span>`
            : `<span class="badge b-neutral">offen</span> <form class="inline" data-post="${aktion(`empfehlung/${e.id}/aktivieren`)}" data-frage="${escapeHtml(e.firma)} ist Kunde geworden? Dann bekommt ${escapeHtml(b.firma)} ${EMPFEHLUNGS_PRAEMIE_EUR} € gutgeschrieben."><button class="kn">Ist Kunde: ${EMPFEHLUNGS_PRAEMIE_EUR} € gutschreiben</button><div class="meldung"></div></form>`
        }</li>`,
    )
    .join("");

  const logsHtml = logs
    .map((l) => `<li><span class="zeit">${datumZeitDE(l.erstelltAm)}</span><span class="akt">${escapeHtml(l.aktion)}</span>${escapeHtml(l.detail)}</li>`)
    .join("");

  return seite(
    b.firma,
    `
  <p class="zurueck"><a href="${basis}/betriebe">← Zur Kundenliste</a></p>
  <div class="kopfzeile">
    <div>
      <h1>${escapeHtml(b.firma)}</h1>
      <p class="unter">${escapeHtml(b.name)} · ${escapeHtml(b.gewerkTyp)}${b.ort ? " · " + escapeHtml(b.ort) : ""} · Mitglied seit ${datumDE(b.erstelltAm)}</p>
    </div>
    <div>${statusBadge(b)}</div>
  </div>
  ${
    b.blockiert
      ? `<div class="karte" style="border-left:4px solid #c62828;"><b>Blockiert</b>${b.blockiertAm ? " seit " + datumDE(b.blockiertAm) : ""}${
          b.blockiertGrund ? ": " + escapeHtml(b.blockiertGrund) : ""
        }</div>`
      : ""
  }

  <div class="kennz">
    <div class="kachel"><div class="wert">${usage.versandbereit + usage.offenePreise + usage.versendet}</div><div class="lab">Angebote gesamt</div></div>
    <div class="kachel"><div class="wert">${usage.versandbereit}</div><div class="lab">Versandbereit</div></div>
    <div class="kachel"><div class="wert">${usage.offenePreise}</div><div class="lab">Offene Preise</div></div>
    <div class="kachel"><div class="wert">${usage.versendet}</div><div class="lab">Versendet</div></div>
    <div class="kachel"><div class="wert">${euroDE(b.guthabenEuro + (b.stripeGuthabenEuro ?? 0))}</div><div class="lab">Guthaben offen${b.stripeGuthabenEuro ? ` (davon ${euroDE(b.stripeGuthabenEuro)} in Stripe)` : ""}</div></div>
    <div class="kachel"><div class="wert">${euroDE(b.umsatz)}</div><div class="lab">Umsatz seit Beitritt</div></div>
    <div class="kachel"><div class="wert">${euroDE(kiKosten.cent30Tage / 100)}</div><div class="lab">KI-Kosten, 30 Tage</div></div>
    <div class="kachel"><div class="wert">${euroDE(kiKosten.centGesamt / 100)}</div><div class="lab">KI-Kosten gesamt</div></div>
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Als Kunde ansehen</h2>
    <p class="hinweis" style="margin-top:0;">Öffnet die echten Kundenseiten in einem neuen Tab — Änderungen dort wirken wie vom Kunden selbst.</p>
    <p style="display:flex;gap:10px;flex-wrap:wrap;margin:0;">
      <a class="kn" style="display:inline-block;text-decoration:none;background:#0b5cad;color:#fff;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;" href="${aktion("als-kunde")}" target="_blank" rel="noopener">Kunden-Cockpit öffnen</a>
      <a class="kn" style="display:inline-block;text-decoration:none;background:#5a616b;color:#fff;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;" href="${aktion("als-kunde")}?ziel=einstellungen" target="_blank" rel="noopener">Einstellungen öffnen</a>
    </p>
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Kontakt ändern</h2>
    <form class="zeile" data-post="${aktion("kontakt")}">
      <label class="feld">WhatsApp-Nummer (nur Ziffern, mit Ländervorwahl)
        <input name="nummer" value="${escapeHtml(b.whatsappNummer)}" pattern="[0-9]{6,16}" required>
      </label>
      <label class="feld">E-Mail
        <input name="email" type="email" value="${escapeHtml(b.email)}" required>
      </label>
      <button class="kn">Speichern</button>
      <div class="meldung"></div>
    </form>
    <p class="hinweis">Neues Handy mit neuer Nummer: Hier die neue Nummer eintragen — Angebote, Einstellungen und Preisgedächtnis bleiben erhalten.</p>
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Gutschrift (Euro)</h2>
    <form class="zeile" data-post="${aktion("gutschrift")}">
      <label class="feld">Betrag in €
        <input name="betrag" type="number" min="1" max="1000" step="0.01" value="100" required>
      </label>
      <label class="feld">Grund (z.B. „Kulanz" oder „Empfehlung Malermeister Krause")
        <input name="grund" required minlength="3">
      </label>
      <button class="kn">Gutschreiben</button>
      <div class="meldung"></div>
    </form>
    <p class="hinweis">Stripe-Kunden: verrechnet sich automatisch mit den nächsten Rechnungen. Sonst als Konto-Guthaben vermerkt, das du bei der nächsten Zahlung unten verrechnest. Empfehlungen aktivierst du im Abschnitt „Geworbene Kollegen", die Prämie von ${EMPFEHLUNGS_PRAEMIE_EUR} € geht dann automatisch raus.</p>
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Abo &amp; Abrechnung</h2>
    ${
      abo
        ? `<p style="margin:0 0 12px;font-size:14px;">
            <span class="badge b-test">${escapeHtml(abo.tarif)}</span>
            <b>${euroDE(abo.monatspreis)}/Monat</b> · seit ${datumDE(abo.beginntAm)} ·
            ${abo.status === "AKTIV" ? `<span class="badge b-aktiv">aktiv</span>` : `<span class="badge b-inaktiv">gekündigt${abo.gekuendigtAm ? " am " + datumDE(abo.gekuendigtAm) : ""}</span>`}
          </p>`
        : `<p style="margin:0 0 12px;font-size:14px;color:#888;">Noch kein Abo hinterlegt.</p>`
    }
    <form class="zeile" data-post="${aktion("abo")}">
      <label class="feld">Tarif
        <select name="tarif" id="tarifwahl">
          ${["BASIS", "PROFI", "TEAM", "INDIVIDUELL"]
            .map((t) => `<option value="${t}"${abo?.tarif === t ? " selected" : ""}>${t}${tarifPresets[t] ? ` (${tarifPresets[t]} €)` : ""}</option>`)
            .join("")}
        </select>
      </label>
      <label class="feld">Monatspreis (EUR)
        <input name="monatspreis" id="tarifpreis" type="number" step="0.01" min="0" value="${abo ? abo.monatspreis : tarifPresets.BASIS}" required>
      </label>
      <button class="kn">${abo ? (abo.status === "AKTIV" ? "Abo ändern" : "Abo reaktivieren") : "Abo anlegen"}</button>
      <div class="meldung"></div>
    </form>
    ${
      abo && abo.status === "AKTIV"
        ? `<form class="zeile" style="margin-top:10px;" data-post="${aktion("abo-kuendigen")}" data-frage="Abo wirklich auf gekündigt setzen?">
            <button class="kn grau">Abo kündigen</button>
            <div class="meldung"></div>
          </form>`
        : ""
    }
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Zahlung erfassen</h2>
    <form class="zeile" data-post="${aktion("zahlung")}">
      <label class="feld">Betrag (EUR)
        <input name="betrag" type="number" step="0.01" value="${abo ? abo.monatspreis : ""}" required>
      </label>
      <label class="feld">Monat (JJJJ-MM)
        <input name="zeitraum" value="${escapeHtml(aktuellerZeitraum)}" pattern="\\d{4}-(0[1-9]|1[0-2])" required>
      </label>
      <label class="feld">Notiz (optional)
        <input name="notiz" placeholder="z.B. Überweisung 11.08.">
      </label>
      <button class="kn">Zahlung buchen</button>
      <div class="meldung"></div>
    </form>
    ${
      b.guthabenEuro > 0
        ? `<form class="zeile" style="margin-top:10px;" data-post="${aktion("guthaben-verrechnen")}" data-frage="Guthaben mit der Zahlung dieses Monats verrechnen? (negative Gutschrift-Buchung)">
            <label class="feld">Betrag in €
              <input name="betrag" type="number" min="0.01" max="${b.guthabenEuro}" step="0.01" value="${b.guthabenEuro}" required>
            </label>
            <label class="feld">Monat (JJJJ-MM)
              <input name="zeitraum" value="${escapeHtml(aktuellerZeitraum)}" pattern="\\d{4}-(0[1-9]|1[0-2])" required>
            </label>
            <button class="kn warn">Guthaben verrechnen (${euroDE(b.guthabenEuro)} offen)</button>
            <div class="meldung"></div>
          </form>`
        : ""
    }
    ${
      buchungen.length
        ? `<h2>Zahlungshistorie</h2>
          <div class="tabellenrahmen">
          <table class="liste">
            <thead><tr><th>Monat</th><th>Art</th><th style="text-align:right;">Betrag</th><th>Notiz</th><th>Gebucht am</th></tr></thead>
            <tbody>${buchungen
              .map(
                (bu) =>
                  `<tr><td>${escapeHtml(bu.zeitraum)}</td><td><span class="badge ${bu.typ === "ZAHLUNG" ? "b-aktiv" : "b-neutral"}">${escapeHtml(bu.typ)}</span></td><td style="text-align:right;">${euroDE(bu.betrag)}</td><td>${escapeHtml(bu.notiz || "—")}</td><td>${datumDE(bu.erstelltAm)}</td></tr>`,
              )
              .join("")}</tbody>
          </table>
          </div>`
        : ""
    }
  </div>

  <script>
    // Tarifwahl belegt den Monatspreis mit dem Preset vor (INDIVIDUELL: freilassen).
    (function () {
      var presets = ${jsonInsSkript(tarifPresets)};
      var wahl = document.getElementById("tarifwahl");
      var preis = document.getElementById("tarifpreis");
      if (wahl && preis) wahl.addEventListener("change", function () {
        if (presets[wahl.value] != null) preis.value = presets[wahl.value];
      });
    })();
  </script>

  <div class="karte">
    <h2 style="margin-top:0;">${b.blockiert ? "Entsperren" : "Blockieren"}</h2>
    ${
      b.blockiert
        ? `<form class="zeile" data-post="${aktion("entsperren")}">
            <button class="kn grau">Konto entsperren</button>
            <div class="meldung"></div>
          </form>`
        : `<form class="zeile" data-post="${aktion("blockieren")}" data-frage="Dieses Konto wirklich blockieren? Der Betrieb bekommt auf WhatsApp nur noch einen Pausiert-Hinweis.">
            <label class="feld">Grund (intern)
              <input name="grund" required minlength="3" placeholder="z.B. Zahlung ausstehend seit …">
            </label>
            <button class="kn warn">Konto blockieren</button>
            <div class="meldung"></div>
          </form>`
    }
  </div>

  <div class="karte">
    <h2 style="margin-top:0;">Betrieb löschen</h2>
    <p class="hinweis" style="margin-top:0;">Löscht Angebote, Vorgänge, Preisgedächtnis, Importe und Feedback endgültig (DSGVO). Die Nummer kann sich danach neu anmelden. Zur Sicherheit den Firmennamen exakt eintippen.</p>
    <form class="zeile" data-post="${aktion("loeschen")}" data-ziel="${basis}/betriebe" data-frage="Wirklich ENDGÜLTIG löschen? Das kann nicht rückgängig gemacht werden.">
      <label class="feld">Firmenname zur Bestätigung
        <input name="bestaetigung" required placeholder="${escapeHtml(b.firma)}">
      </label>
      <button class="kn rot">Endgültig löschen</button>
      <div class="meldung"></div>
    </form>
  </div>

  <h2>Letzte Angebote</h2>
  <div class="tabellenrahmen">
  <table class="liste">
    <thead><tr><th>Nummer</th><th>Datum</th><th style="text-align:right;">Brutto</th><th>Status</th></tr></thead>
    <tbody>${angeboteHtml || `<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">Noch keine Angebote.</td></tr>`}</tbody>
  </table>
  </div>
  ${usage.protokolle ? `<p class="hinweis">Dazu ${usage.protokolle} Protokoll(e).</p>` : ""}

  <h2>Geworbene Kollegen</h2>
  <div class="karte">
    ${empfehlungenHtml ? `<ul class="log">${empfehlungenHtml}</ul>` : `<span style="color:#888;font-size:13.5px;">Keine Empfehlungen.</span>`}
  </div>

  <h2>Admin-Protokoll</h2>
  <div class="karte">
    ${logsHtml ? `<ul class="log">${logsHtml}</ul>` : `<span style="color:#888;font-size:13.5px;">Noch keine Aktionen.</span>`}
  </div>`,
  );
}

// ── Umsatz-Übersicht ────────────────────────────────────────────────────────

export function betreiberUmsatz(args: {
  basis: string;
  kpis: { mrr: number; einnahmenMonat: number; gesamtUmsatz: number; zahlendeKunden: number; offenesGuthaben: number };
  verlauf: Array<{ zeitraum: string; summe: number }>; // aufsteigend
  tarife: Array<{ tarif: string; anzahl: number }>;
  topKunden: Array<{ id: string; firma: string; tarif: string | null; umsatz: number }>;
  aktuellerZeitraum: string;
}): string {
  const { basis, kpis, verlauf, tarife, topKunden, aktuellerZeitraum } = args;

  const max = Math.max(...verlauf.map((v) => v.summe), 1);
  const balken = [...verlauf]
    .reverse() // neuester Monat oben
    .map((v) => {
      const breite = Math.max(2, Math.round((v.summe / max) * 100));
      const istAktuell = v.zeitraum === aktuellerZeitraum;
      return `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;">
        <span style="flex:0 0 66px;font-size:12.5px;color:${istAktuell ? "#0b5cad" : "#666"};font-weight:${istAktuell ? "700" : "400"};">${escapeHtml(v.zeitraum)}</span>
        <div style="flex:1;background:#eef0f3;border-radius:6px;overflow:hidden;">
          <div style="width:${breite}%;background:${istAktuell ? "#0b5cad" : "#7fa8cc"};height:20px;border-radius:6px;"></div>
        </div>
        <span style="flex:0 0 96px;text-align:right;font-size:13px;font-weight:600;">${euroDE(v.summe)}</span>
      </div>`;
    })
    .join("");

  const tarifHtml = tarife.map((t) => `<span class="badge b-test" style="margin-right:8px;">${escapeHtml(t.tarif)}: ${t.anzahl}</span>`).join("");

  const topHtml = topKunden
    .map(
      (k) =>
        `<tr><td><a href="${basis}/betrieb/${k.id}"><b>${escapeHtml(k.firma)}</b></a></td><td>${k.tarif ? `<span class="badge b-test">${escapeHtml(k.tarif)}</span>` : "—"}</td><td style="text-align:right;">${euroDE(k.umsatz)}</td></tr>`,
    )
    .join("");

  return seite(
    "Umsatz",
    `
  <p class="zurueck"><a href="${basis}/betriebe">← Zur Kundenliste</a></p>
  <h1>Umsatz</h1>
  <p class="unter">Alle Beträge aus dem Buchungs-Ledger (Ist), MRR aus den aktiven Abos (Soll).</p>

  <div class="kennz">
    <div class="kachel"><div class="wert">${euroDE(kpis.mrr)}</div><div class="lab">MRR (aktive Abos)</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.einnahmenMonat)}</div><div class="lab">Einnahmen, dieser Monat</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.gesamtUmsatz)}</div><div class="lab">Umsatz seit Start</div></div>
    <div class="kachel"><div class="wert">${kpis.zahlendeKunden}</div><div class="lab">Zahlende Kunden</div></div>
    <div class="kachel"><div class="wert">${euroDE(kpis.offenesGuthaben)}</div><div class="lab">Offenes Guthaben</div></div>
  </div>

  <h2>Monatsverlauf</h2>
  <div class="karte">
    ${balken || `<span style="color:#888;font-size:13.5px;">Noch keine Buchungen. Zahlungen erfasst du auf der Detailseite eines Kunden.</span>`}
  </div>

  <h2>Abos nach Tarif</h2>
  <div class="karte">
    ${tarifHtml || `<span style="color:#888;font-size:13.5px;">Noch keine aktiven Abos.</span>`}
  </div>

  <h2>Kunden nach Umsatz</h2>
  <div class="tabellenrahmen">
  <table class="liste">
    <thead><tr><th>Betrieb</th><th>Tarif</th><th style="text-align:right;">Umsatz gesamt</th></tr></thead>
    <tbody>${topHtml || `<tr><td colspan="3" style="text-align:center;color:#888;padding:20px;">Noch keine Umsätze.</td></tr>`}</tbody>
  </table>
  </div>`,
  );
}
