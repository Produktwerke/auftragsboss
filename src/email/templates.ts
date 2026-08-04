// HTML-E-Mail-Templates. Bewusst simpel gehalten (Inline-Styles), damit die
// Mail in Outlook & Gmail auch bei konservativen Empfängern funktioniert.
//
// Look im AuftragsBoss-Stil: HELLER Hintergrund (kein Weiß-auf-Schwarz),
// dunkler Kopfbanner nur als Marken-Streifen, Signalgelb als Akzent (Button,
// Trennlinien), sonst dunkle Schrift auf Weiß. Explizite Hintergrund- UND
// Textfarbe überall, damit die Mail im Dark Mode von Outlook/Gmail nicht kippt.
// Erst- und Folge-Fassungen nutzen dasselbe Layout; der Nachtrag bekommt nur
// eine dezente Notiz oben, keine andersfarbige Box.
import { readFileSync } from "node:fs";
import type { DokumentDaten } from "../ai/structure.js";
import type { Angebotssumme } from "../angebot/berechnung.js";
import { euro, mengeMitEinheit, PLATZHALTER } from "../angebot/berechnung.js";
import type { Preisliste } from "../preisliste.js";
import type { Anhang } from "./send.js";

// ── Marken-Farben (E-Mail-tauglich, hell) ─────────────────
const ANTHRA = "#14161A"; // Kopfbanner, Tabellenkopf, Akzente
const INK = "#1f2328"; // Fließtext
const MUTED = "#6b7079"; // Sekundärtext
const SIGNAL = "#FFC426"; // Signalgelb: Button, Akzentlinien
const HAIR = "#e4e7ea"; // Trennlinien / Kartenrand
const CARD = "#f5f6f8"; // helle Karten
const AMBER = "#fff8e6"; // Hinweis-/Warn-Karten
const AMBER_BORDER = "#e9b949";

const FONT = "font-family:'Segoe UI',Roboto,Arial,sans-serif";
const RAHMEN = `${FONT};max-width:680px;margin:0 auto;background:#ffffff;color:${INK};line-height:1.55;`;
const H3 = `font-size:15px;color:${INK};margin:24px 0 8px;font-weight:700;`;

// Logo wird als CID-Anhang FEST an jede Mail gehängt (siehe logoAnhang()),
// damit es ohne „Bilder anzeigen" sofort erscheint. Kleingerechnete Version
// (128 px, ~6 KB) liegt unter src/assets und wird einmal eingelesen.
const LOGO_CID = "auftragsboss-logo";
let logoBuffer: Buffer | undefined;
function logoBytes(): Buffer {
  if (!logoBuffer) logoBuffer = readFileSync(new URL("../assets/auftragsboss-logo-mail.png", import.meta.url));
  return logoBuffer;
}
/** Logo als eingebetteter Inline-Anhang. Muss JEDER Mail beigelegt werden, die
 *  die Signatur nutzt (dokumentMail, gewaehrleistungsErinnerung), sonst bleibt
 *  das Bild leer. */
export function logoAnhang(): Anhang {
  return { filename: "auftragsboss-logo.png", content: logoBytes(), contentType: "image/png", cid: LOGO_CID };
}

const datumDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Marken-Kopfbanner (dunkler Streifen mit Wortmarke). */
const kopfBanner = `
  <div style="background:${ANTHRA};padding:16px 24px;">
    <span style="font-size:20px;font-weight:800;letter-spacing:.3px;color:#ffffff;${FONT};">AUFTRAGS<span style="color:${SIGNAL};">BOSS</span></span>
  </div>`;

/** Signatur (heller Fuß mit Logo und Kontaktdaten des Anbieters). */
const signatur = `
  <div style="border-top:1px solid ${HAIR};margin-top:28px;padding-top:18px;font-size:13px;color:${MUTED};line-height:1.65;">
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="cid:${LOGO_CID}" alt="AuftragsBoss" width="34" height="34" style="display:block;border-radius:7px;">
        </td>
        <td style="vertical-align:middle;font-weight:800;color:${INK};font-size:16px;letter-spacing:.2px;">AUFTRAGSBOSS</td>
      </tr>
    </table>
    <div>Ein Dienst der DAG Deutsche Automotive GmbH</div>
    <div>Augsburger Straße 746 · 70329 Stuttgart</div>
    <div>
      Tel. <a href="tel:+491749364823" style="color:${INK};text-decoration:none;">+49 174 936 4823</a> ·
      <a href="mailto:kontakt@auftragsboss.de" style="color:${INK};text-decoration:none;">kontakt@auftragsboss.de</a> ·
      <a href="https://auftragsboss.de" style="color:${INK};text-decoration:none;">auftragsboss.de</a>
    </div>
    <div style="color:#9aa0a6;margin-top:8px;">Per WhatsApp diktiert. Als fertiges Angebot zurück.</div>
  </div>`;

/** Helle Karte. Mit `akzent` bekommt sie eine farbige Leiste links statt Rand. */
const box = (inhalt: string, bg = CARD, akzent?: string) =>
  `<div style="background:${bg};color:${INK};border-radius:10px;` +
  `${akzent ? `border-left:3px solid ${akzent};` : `border:1px solid ${HAIR};`}` +
  `padding:16px 20px;margin:16px 0;font-size:14px;">${inhalt}</div>`;

/** Positionstabelle. Fehlende Preise sind der Normalfall und erscheinen als
 *  neutrale Platzhalter zum Ausfüllen, nicht als Fehler. */
function positionsTabelle(summe: Angebotssumme): string {
  const zellStil = "padding:8px 10px;border-bottom:1px solid #e3e6ea;vertical-align:top;";
  const kopfStil = `padding:8px 10px;background:${ANTHRA};color:#ffffff;text-align:left;font-size:13px;`;
  const leer = `<span style="color:#aab0b6;letter-spacing:1px;">${PLATZHALTER}</span>`;

  const abschnitt = (text: string) =>
    `<tr><td colspan="5" style="padding:10px 10px 6px;background:#eef1f4;color:#666;
      font-weight:600;font-size:13px;">${escapeHtml(text)}</td></tr>`;

  const zeile = (p: (typeof summe.positionen)[number]) => {
      const preisZelle = p.einzelpreis !== null ? euro(p.einzelpreis) : leer;
      const gesamtZelle = p.gesamt !== null ? `<strong>${euro(p.gesamt)}</strong>` : leer;
      const mengeZelle =
        p.menge !== null || p.einheit === "pauschal"
          ? mengeMitEinheit(p.menge, p.einheit)
          : `<span style="color:#aab0b6;">____ ${p.einheit ?? ""}</span>`;
      const hinweis = p.mengeUnsicher
        ? `<br><span style="color:#b7791f;font-size:12px;">≈ Menge abgeleitet, bitte prüfen</span>`
        : "";

      return `<tr>
        <td style="${zellStil}text-align:right;color:#888;">${p.nummer}</td>
        <td style="${zellStil}">${escapeHtml(p.beschreibung)}${hinweis}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${mengeZelle}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${preisZelle}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${gesamtZelle}</td>
      </tr>`;
  };

  // Material zuerst, dann Arbeitsaufwand, gleiche Reihenfolge wie in Editor,
  // PDF und Word. Materialvorschläge bleiben klar als solche gekennzeichnet.
  const material = summe.positionen.filter((p) => p.kategorie === "MATERIAL");
  const leistungen = summe.positionen.filter((p) => p.kategorie !== "MATERIAL");

  const summenZelle = "padding:6px 10px;text-align:right;white-space:nowrap;";

  /** Zwischensummenzeile eines Blocks. Ohne vollständige Preise bleibt sie leer. */
  const zwischensumme = (beschriftung: string, teil: typeof summe.leistungen) =>
    `<tr>
      <td colspan="4" style="${summenZelle}color:#666;font-weight:600;">${escapeHtml(beschriftung)}</td>
      <td style="${summenZelle}color:#666;font-weight:600;">${teil.vollstaendig ? euro(teil.netto) : leer}</td>
    </tr>`;

  const zeilen = [
    ...(material.length > 0
      ? [
          abschnitt(
            material.some((p) => p.vorschlag)
              ? "Material  (Vorschlag: bitte prüfen und Mengen ergänzen)"
              : "Material",
          ),
          ...material.map(zeile),
          zwischensumme("Zwischensumme Material", summe.material),
          abschnitt("Arbeitsaufwand"),
        ]
      : []),
    ...leistungen.map(zeile),
    ...(material.length > 0 ? [zwischensumme("Zwischensumme Arbeitsaufwand", summe.leistungen)] : []),
  ].join("");

  // Solange nicht alle Preise stehen, ist eine ausgerechnete Summe irreführend;
  // dann zeigen wir durchgehend Platzhalter.
  const nettoWert = summe.vollstaendig ? euro(summe.netto) : leer;
  const mwstWert = summe.vollstaendig ? euro(summe.mwstBetrag) : leer;
  const bruttoWert = summe.vollstaendig
    ? `<span style="color:${INK};">${euro(summe.brutto)}</span>`
    : leer;

  return `
  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:${INK};">
    <thead><tr>
      <th style="${kopfStil}text-align:right;">Pos.</th>
      <th style="${kopfStil}">Leistung</th>
      <th style="${kopfStil}text-align:right;">Menge</th>
      <th style="${kopfStil}text-align:right;">Einzelpreis</th>
      <th style="${kopfStil}text-align:right;">Gesamt</th>
    </tr></thead>
    <tbody>${zeilen}</tbody>
    <tfoot>
      <tr><td colspan="4" style="${summenZelle}">Nettosumme</td>
          <td style="${summenZelle}">${nettoWert}</td></tr>
      <tr><td colspan="4" style="${summenZelle}color:#666;">zzgl. ${summe.mwstSatz} % MwSt.</td>
          <td style="${summenZelle}color:#666;">${mwstWert}</td></tr>
      <tr><td colspan="4" style="${summenZelle}font-size:16px;font-weight:700;border-top:2px solid ${SIGNAL};">Gesamtbetrag</td>
          <td style="${summenZelle}font-size:16px;font-weight:700;border-top:2px solid ${SIGNAL};">${bruttoWert}</td></tr>
    </tfoot>
  </table>
  </div>`;
}

/** Das fertige Kundendokument (Angebot oder Protokoll) als HTML-Block. */
function kundenDokument(
  daten: DokumentDaten,
  summe: Angebotssumme,
  preisliste: Preisliste,
  nummer: string,
  datum: Date,
): string {
  const b = preisliste.betrieb;
  const istAngebot = daten.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Arbeitsprotokoll";

  const kopf = `
    <div style="border-bottom:2px solid ${ANTHRA};padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;color:${ANTHRA};">${escapeHtml(b.firma)}</div>
      <div style="font-size:12px;color:#666;">
        ${escapeHtml([b.strasse, `${b.plz} ${b.ort}`.trim()].filter(Boolean).join(" · "))}
        ${b.telefon ? ` · Tel. ${escapeHtml(b.telefon)}` : ""}
        ${b.email ? ` · ${escapeHtml(b.email)}` : ""}
      </div>
    </div>`;

  const empfaenger = `
    <div style="font-size:14px;margin-bottom:16px;">
      ${daten.kunde.name ? `<strong>${escapeHtml(daten.kunde.name)}</strong><br>` : ""}
      ${daten.kunde.strasse ? `${escapeHtml(daten.kunde.strasse)}<br>` : ""}
      ${daten.kunde.plzOrt ? `${escapeHtml(daten.kunde.plzOrt)}<br>` : ""}
    </div>
    <div style="font-size:13px;color:#666;margin-bottom:8px;">
      <strong style="color:#1a1a1a;font-size:16px;">${titel} ${escapeHtml(nummer)}</strong>
    </div>
    <div style="font-size:13px;color:#666;margin-bottom:16px;">Datum: ${datumDE(datum)}${
      daten.objekt ? ` · Objekt: ${escapeHtml(daten.objekt)}` : ""
    }</div>`;

  const gueltigkeit = istAngebot
    ? `<p style="font-size:13px;color:#666;">Dieses Angebot ist gültig bis <strong>${datumDE(
        summe.gueltigBis,
      )}</strong>. Zahlungsziel: ${escapeHtml(preisliste.konditionen.zahlungsziel)}.</p>`
    : "";

  return `
    ${kopf}
    ${empfaenger}
    <div style="white-space:pre-wrap;font-size:14px;margin-bottom:16px;">${escapeHtml(daten.einleitung)}</div>
    ${positionsTabelle(summe)}
    <div style="white-space:pre-wrap;font-size:14px;margin-top:16px;">${escapeHtml(daten.schlusstext)}</div>
    ${gueltigkeit}`;
}

export function dokumentMail(args: {
  daten: DokumentDaten;
  summe: Angebotssumme;
  preisliste: Preisliste;
  transkript?: string;
  nummer: string;
  datum: Date;
  gewaehrleistungAblauf?: Date;
  wordDateiname?: string;
  version?: number;
  bearbeitenUrl?: string;
  kundenUrl?: string;
}): { betreff: string; html: string } {
  const {
    daten,
    summe,
    preisliste,
    nummer,
    datum,
    gewaehrleistungAblauf,
    wordDateiname,
    version = 1,
    bearbeitenUrl,
  } = args;
  const istNachtrag = version > 1;
  const istAngebot = daten.art === "ANGEBOT";
  const kunde = daten.kunde.name ?? "Unbekannter Kunde";
  const titel = istAngebot ? "Angebot" : "Protokoll";

  const kopfSymbol = istNachtrag ? "🔄" : istAngebot ? "📄" : "📋";
  const zusatz = istNachtrag ? ` (Fassung ${version})` : "";
  const betreff = summe.vollstaendig
    ? `${kopfSymbol} ${titel} ${nummer}${zusatz}: ${kunde}, ${euro(summe.brutto)}`
    : `${kopfSymbol} ${titel} ${nummer}${zusatz}: ${kunde}, ${summe.positionen.length} Positionen`;

  // Zwischenstand steht bewusst NUR in der Mail an den Handwerker, nie im
  // Kundendokument.
  const zwischenstand =
    !summe.vollstaendig && summe.bereitsBepreist > 0
      ? `<br><br><strong>Zwischenstand:</strong> ${euro(summe.bereitsBepreist)} netto aus
         ${summe.positionen.length - summe.anzahlOffen} von ${summe.positionen.length} Positionen.
         ${summe.anzahlOffen} warten noch auf Preis oder Menge.`
      : "";

  // Nachtrag: dezente Notiz oben, GLEICHES Layout wie die Erst-Mail, nur mit
  // gelber Akzentleiste statt einer andersfarbigen Box.
  const nachtragKasten = istNachtrag
    ? box(
        `<strong>Aktualisierte Fassung ${version}</strong><br>
         Dein Nachtrag ist eingearbeitet. Die Angebotsnummer bleibt gleich.
         Verwende ab jetzt die Datei aus <em>dieser</em> E-Mail. Die vorherige Fassung bleibt im Archiv.`,
        CARD,
        SIGNAL,
      )
    : "";

  // CTA: helle Karte mit gelbem Button (dunkle Schrift), der Haupt-Weg.
  const linkKasten = bearbeitenUrl
    ? `<div style="background:${CARD};border:1px solid ${HAIR};border-radius:10px;padding:20px;margin:16px 0;">
         <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:6px;">
           ${istAngebot ? "Angebot" : "Protokoll"} online bearbeiten
         </div>
         <div style="font-size:14px;color:${MUTED};margin-bottom:16px;">
           Preise eintragen, Positionen anpassen, die Summen rechnen automatisch mit.
           Danach als PDF oder Word exportieren.
         </div>
         <a href="${bearbeitenUrl}" style="display:inline-block;background:${SIGNAL};color:${ANTHRA};
            text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;">
           Jetzt bearbeiten →
         </a>
       </div>`
    : "";

  const anhangKasten = wordDateiname
    ? box(
        `<strong style="color:${INK};">📎 ${escapeHtml(wordDateiname)}</strong><br>
         Word-Datei im Anhang. Dort ${
           summe.vollstaendig ? "prüfen und" : "die Preise eintragen,"
         } bei Bedarf anpassen, dann als PDF speichern und an den Kunden schicken.
         ${
           !summe.vollstaendig && istAngebot
             ? `<br><span style="color:${MUTED};font-size:13px;">Schneller geht's per Sprachnachricht:
                Preise und Mengen einfach durchsagen, ich rechne und schicke die Datei neu.</span>`
             : ""
         }${zwischenstand}`,
      )
    : "";

  const rueckfragen =
    daten.rueckfragen.length > 0
      ? box(
          `<strong>❓ Vor dem Versand prüfen</strong>
           <ul style="margin:8px 0;padding-left:20px;">${daten.rueckfragen
             .map((f) => `<li>${escapeHtml(f)}</li>`)
             .join("")}</ul>`,
          AMBER,
          AMBER_BORDER,
        )
      : "";

  const gewaehrleistungsBlock =
    daten.gewaehrleistung && gewaehrleistungAblauf
      ? `<h3 style="${H3}">3️⃣ Gewährleistung: automatisch im Blick</h3>
         ${box(
           `<strong>Frist:</strong> ${
             daten.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2
           } Jahre (§ 634a BGB: ${escapeHtml(daten.gewaehrleistung.begruendung)})<br>
            <strong>Läuft ab am:</strong> ${datumDE(gewaehrleistungAblauf)}<br>
            <span style="color:${INK};">🔔 Du bekommst automatisch 3 Monate vor Ablauf eine Erinnerung,
            die perfekte Gelegenheit für ein Wartungsangebot.</span>`,
           AMBER,
           AMBER_BORDER,
         )}`
      : "";

  const html = `
<div style="${RAHMEN}">
  ${kopfBanner}
  <div style="padding:24px;">
    <h2 style="font-size:21px;color:${INK};margin:4px 0 2px;font-weight:800;">${
      istNachtrag
        ? `${titel} ${escapeHtml(nummer)} aktualisiert`
        : istAngebot
          ? "Dein Angebot ist fertig"
          : "Dein Protokoll ist fertig"
    }</h2>
    <div style="height:3px;width:44px;background:${SIGNAL};border-radius:2px;margin:0 0 14px;"></div>

    ${nachtragKasten}
    ${linkKasten}
    ${anhangKasten}
    ${rueckfragen}

    <h3 style="${H3}">1️⃣ Vorschau: so sieht die Word-Datei aus</h3>
    <p style="color:${MUTED};font-size:14px;margin:0 0 10px;">Zum Bearbeiten den Anhang öffnen; hier nur zur schnellen Kontrolle:</p>
    <div style="border:1px solid ${HAIR};border-radius:10px;padding:20px;background:#ffffff;color:${INK};">
      ${kundenDokument(daten, summe, preisliste, nummer, datum)}
    </div>

    <h3 style="${H3}">2️⃣ Notizen für dich (nicht im Kundenangebot)</h3>
    ${box(`
      ${daten.aufmassNotizen ? `<strong>📐 Aufmaß:</strong> ${escapeHtml(daten.aufmassNotizen)}<br>` : ""}
      ${daten.besonderheiten ? `<strong>⚠️ Besonderheiten:</strong> ${escapeHtml(daten.besonderheiten)}<br>` : ""}
      ${daten.folgetermin ? `<strong>📅 Folgetermin:</strong> ${escapeHtml(daten.folgetermin)}<br>` : ""}
      <span style="color:#888;font-size:13px;">Archiv-Nr. ${escapeHtml(nummer)}</span>
    `)}

    ${gewaehrleistungsBlock}

    ${signatur}
  </div>
</div>`;

  return { betreff, html };
}

export function gewaehrleistungsErinnerung(args: {
  art: "VORWARNUNG" | "ABLAUF";
  kunde: string;
  datum: Date;
  ablauf: Date;
  nummer: string;
  einleitung: string;
}): { betreff: string; html: string } {
  const { art, kunde, datum, ablauf, nummer, einleitung } = args;

  if (art === "VORWARNUNG") {
    return {
      betreff: `🔔 Gewährleistung läuft in 3 Monaten ab: ${kunde}`,
      html: `
<div style="${RAHMEN}">
  ${kopfBanner}
  <div style="padding:24px;">
    <h2 style="color:#b7791f;margin:4px 0 12px;font-size:20px;">🔔 Gewährleistungs-Erinnerung</h2>
    <p>Die Gewährleistung für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
       (${datumDE(datum)}, Archiv-Nr. ${escapeHtml(nummer)}) läuft am
       <strong>${datumDE(ablauf)}</strong> ab.</p>
    ${box(
      `<strong>💡 Deine Chance:</strong> Jetzt beim Kunden melden und einen
       <strong>Wartungs- oder Prüftermin</strong> anbieten, bevor die Frist endet.
       Das wirkt professionell und bringt Folgeaufträge.`,
      AMBER,
      AMBER_BORDER,
    )}
    ${signatur}
  </div>
</div>`,
    };
  }

  return {
    betreff: `✅ Gewährleistung abgelaufen: ${kunde}`,
    html: `
<div style="${RAHMEN}">
  ${kopfBanner}
  <div style="padding:24px;">
    <h2 style="color:#2e7d32;margin:4px 0 12px;font-size:20px;">✅ Gewährleistung beendet</h2>
    <p>Die Gewährleistungsfrist für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
       (${datumDE(datum)}, Archiv-Nr. ${escapeHtml(nummer)}) ist am
       <strong>${datumDE(ablauf)}</strong> abgelaufen. Deine Haftung für diesen
       Auftrag ist damit dokumentiert beendet. Das Dokument bleibt im Archiv.</p>
    ${signatur}
  </div>
</div>`,
  };
}
