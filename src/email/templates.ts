// HTML-E-Mail-Templates. Bewusst simpel gehalten (Inline-Styles) —
// muss in Outlook & Gmail von konservativen Empfängern funktionieren.
//
// Explizite Hintergrund- UND Textfarbe überall: sonst kippt die Mail im
// Dark Mode von Outlook/Gmail zu dunkler Schrift auf dunklem Grund.
import type { DokumentDaten } from "../ai/structure.js";
import type { Angebotssumme } from "../angebot/berechnung.js";
import { euro, mengeMitEinheit, PLATZHALTER } from "../angebot/berechnung.js";
import type { Preisliste } from "../preisliste.js";

const datumDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const RAHMEN =
  "font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;" +
  "background:#ffffff;color:#1a1a1a;line-height:1.5;padding:24px;";

const box = (inhalt: string, farbe = "#f6f8fa") =>
  `<div style="background:${farbe};color:#1a1a1a;border-radius:8px;padding:16px 20px;margin:16px 0;">${inhalt}</div>`;

/** Positionstabelle. Fehlende Preise sind der Normalfall und erscheinen als
 *  neutrale Platzhalter zum Ausfüllen — nicht als Fehler. */
function positionsTabelle(summe: Angebotssumme): string {
  const zellStil = "padding:8px 10px;border-bottom:1px solid #e3e6ea;vertical-align:top;";
  const kopfStil = "padding:8px 10px;background:#0b5cad;color:#ffffff;text-align:left;font-size:13px;";
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
        ? `<br><span style="color:#b7791f;font-size:12px;">≈ Menge abgeleitet — bitte prüfen</span>`
        : "";

      return `<tr>
        <td style="${zellStil}text-align:right;color:#888;">${p.nummer}</td>
        <td style="${zellStil}">${escapeHtml(p.beschreibung)}${hinweis}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${mengeZelle}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${preisZelle}</td>
        <td style="${zellStil}text-align:right;white-space:nowrap;">${gesamtZelle}</td>
      </tr>`;
  };

  // Leistungen und Material getrennt — Materialvorschläge sollen sichtbar
  // als solche erkennbar sein, nicht stillschweigend mitlaufen.
  const leistungen = summe.positionen.filter((p) => p.kategorie !== "MATERIAL");
  const material = summe.positionen.filter((p) => p.kategorie === "MATERIAL");

  const zeilen = [
    ...(material.length > 0 ? [abschnitt("Leistungen")] : []),
    ...leistungen.map(zeile),
    ...(material.length > 0
      ? [
          abschnitt(
            material.some((p) => p.vorschlag)
              ? "Material  (Vorschlag – bitte prüfen und Mengen ergänzen)"
              : "Material",
          ),
          ...material.map(zeile),
        ]
      : []),
  ].join("");

  const summenZelle = "padding:6px 10px;text-align:right;white-space:nowrap;";

  // Solange nicht alle Preise stehen, ist eine ausgerechnete Summe irreführend —
  // dann zeigen wir durchgehend Platzhalter.
  const nettoWert = summe.vollstaendig ? euro(summe.netto) : leer;
  const mwstWert = summe.vollstaendig ? euro(summe.mwstBetrag) : leer;
  const bruttoWert = summe.vollstaendig
    ? `<span style="color:#0b5cad;">${euro(summe.brutto)}</span>`
    : leer;

  return `
  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1a1a1a;">
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
      <tr><td colspan="4" style="${summenZelle}font-size:16px;font-weight:700;border-top:2px solid #0b5cad;">Gesamtbetrag</td>
          <td style="${summenZelle}font-size:16px;font-weight:700;border-top:2px solid #0b5cad;">${bruttoWert}</td></tr>
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
    <div style="border-bottom:2px solid #0b5cad;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;color:#0b5cad;">${escapeHtml(b.firma)}</div>
      <div style="font-size:12px;color:#666;">
        ${escapeHtml([b.strasse, `${b.plz} ${b.ort}`.trim()].filter(Boolean).join(" · "))}
        ${b.telefon ? ` · Tel. ${escapeHtml(b.telefon)}` : ""}
        ${b.email ? ` · ${escapeHtml(b.email)}` : ""}
      </div>
    </div>`;

  const empfaenger = `
    <div style="font-size:14px;margin-bottom:16px;">
      ${daten.kunde.name ? `<strong>${escapeHtml(daten.kunde.name)}</strong><br>` : ""}
      ${daten.kunde.adresse ? `${escapeHtml(daten.kunde.adresse)}<br>` : ""}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:8px;">
      <span><strong style="color:#1a1a1a;font-size:16px;">${titel} ${escapeHtml(nummer)}</strong></span>
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
  transkript: string;
  nummer: string;
  datum: Date;
  gewaehrleistungAblauf?: Date;
  wordDateiname?: string;
  version?: number;
}): { betreff: string; html: string } {
  const {
    daten,
    summe,
    preisliste,
    transkript,
    nummer,
    datum,
    gewaehrleistungAblauf,
    wordDateiname,
    version = 1,
  } = args;
  const istNachtrag = version > 1;
  const istAngebot = daten.art === "ANGEBOT";
  const kunde = daten.kunde.name ?? "Unbekannter Kunde";
  const titel = istAngebot ? "Angebot" : "Protokoll";

  const kopfSymbol = istNachtrag ? "🔄" : istAngebot ? "📄" : "📋";
  const zusatz = istNachtrag ? ` (Fassung ${version})` : "";
  const betreff = summe.vollstaendig
    ? `${kopfSymbol} ${titel} ${nummer}${zusatz}: ${kunde} — ${euro(summe.brutto)}`
    : `${kopfSymbol} ${titel} ${nummer}${zusatz}: ${kunde} — ${summe.positionen.length} Positionen`;

  // Der Word-Anhang ist das eigentliche Arbeitsdokument — deshalb ganz oben.
  const anhangKasten = wordDateiname
    ? box(
        `<strong>📎 ${escapeHtml(wordDateiname)}</strong><br>
         Word-Datei im Anhang — dort ${
           summe.vollstaendig ? "prüfen und" : "die Preise eintragen,"
         } bei Bedarf anpassen, dann als PDF speichern und an den Kunden schicken.
         ${
           !summe.vollstaendig && istAngebot
             ? `<br><span style="color:#666;font-size:13px;">Die Preisspalten sind leer gelassen —
                Summen bildest du nach dem Ausfüllen. Tipp: häufige Positionen dauerhaft in
                <code>preisliste.json</code> hinterlegen, dann füllt das System sie künftig selbst aus.</span>`
             : ""
         }`,
        "#eaf2fb",
      )
    : "";

  const rueckfragen =
    daten.rueckfragen.length > 0
      ? box(
          `<strong>❓ Vor dem Versand prüfen</strong>
           <ul style="margin:8px 0;">${daten.rueckfragen.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`,
          "#fff8e6",
        )
      : "";

  const gewaehrleistungsBlock =
    daten.gewaehrleistung && gewaehrleistungAblauf
      ? `<h3>3️⃣ Gewährleistung — automatisch im Blick</h3>
         ${box(
           `<strong>Frist:</strong> ${
             daten.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2
           } Jahre (§ 634a BGB — ${escapeHtml(daten.gewaehrleistung.begruendung)})<br>
            <strong>Läuft ab am:</strong> ${datumDE(gewaehrleistungAblauf)}<br>
            <span style="color:#0b5cad;">🔔 Du bekommst automatisch 3 Monate vor Ablauf eine Erinnerung —
            die perfekte Gelegenheit für ein Wartungsangebot.</span>`,
           "#fff8e6",
         )}`
      : "";

  const nachtragKasten = istNachtrag
    ? box(
        `<strong>🔄 Aktualisierte Fassung ${version}</strong><br>
         Dein Nachtrag ist eingearbeitet. Die Angebotsnummer bleibt gleich —
         verwende ab jetzt die Datei aus <em>dieser</em> E-Mail.
         Die vorherige Fassung bleibt im Archiv.`,
        "#eaf2fb",
      )
    : "";

  const html = `
<div style="${RAHMEN}">
  <h2 style="color:#0b5cad;margin-top:0;">${
    istNachtrag
      ? `🔄 ${titel} ${escapeHtml(nummer)} aktualisiert`
      : istAngebot
        ? "📄 Dein Angebot ist fertig"
        : "✅ Dein Protokoll ist fertig"
  }</h2>
  ${nachtragKasten}
  ${anhangKasten}
  ${rueckfragen}

  <h3>1️⃣ Vorschau — so sieht die Word-Datei aus</h3>
  <p style="color:#666;font-size:14px;">Zum Bearbeiten den Anhang öffnen; hier nur zur schnellen Kontrolle:</p>
  <div style="border:1px solid #d7dbe0;border-radius:8px;padding:20px;background:#ffffff;color:#1a1a1a;">
    ${kundenDokument(daten, summe, preisliste, nummer, datum)}
  </div>

  <h3>2️⃣ Interne Notizen</h3>
  ${box(`
    ${daten.aufmassNotizen ? `<strong>📐 Aufmaß:</strong> ${escapeHtml(daten.aufmassNotizen)}<br>` : ""}
    ${daten.besonderheiten ? `<strong>⚠️ Besonderheiten:</strong> ${escapeHtml(daten.besonderheiten)}<br>` : ""}
    ${daten.folgetermin ? `<strong>📅 Folgetermin:</strong> ${escapeHtml(daten.folgetermin)}<br>` : ""}
    <span style="color:#888;font-size:13px;">Archiv-Nr. ${escapeHtml(nummer)}</span>
  `)}

  ${gewaehrleistungsBlock}

  <details style="margin-top:24px;">
    <summary style="color:#888;cursor:pointer;">Original-Transkript anzeigen (Beweissicherung)</summary>
    <p style="color:#666;font-size:13px;white-space:pre-wrap;">${escapeHtml(transkript)}</p>
  </details>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p style="color:#999;font-size:12px;">Angebotsblitz · Diktiert per WhatsApp, archiviert für immer.</p>
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
  <h2 style="color:#b7791f;margin-top:0;">🔔 Gewährleistungs-Erinnerung</h2>
  <p>Die Gewährleistung für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
     (${datumDE(datum)}, Archiv-Nr. ${escapeHtml(nummer)}) läuft am
     <strong>${datumDE(ablauf)}</strong> ab.</p>
  ${box(
    `<strong>💡 Deine Chance:</strong> Jetzt beim Kunden melden und einen
     <strong>Wartungs- oder Prüftermin</strong> anbieten — bevor die Frist endet.
     Das wirkt professionell und bringt Folgeaufträge.`,
    "#fff8e6",
  )}
  <details><summary style="color:#888;cursor:pointer;">Damaliges Dokument anzeigen</summary>
    <div style="white-space:pre-wrap;color:#666;font-size:13px;">${escapeHtml(einleitung)}</div>
  </details>
</div>`,
    };
  }

  return {
    betreff: `✅ Gewährleistung abgelaufen: ${kunde}`,
    html: `
<div style="${RAHMEN}">
  <h2 style="color:#2e7d32;margin-top:0;">✅ Gewährleistung beendet</h2>
  <p>Die Gewährleistungsfrist für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
     (${datumDE(datum)}, Archiv-Nr. ${escapeHtml(nummer)}) ist am
     <strong>${datumDE(ablauf)}</strong> abgelaufen. Deine Haftung für diesen
     Auftrag ist damit dokumentiert beendet — das Dokument bleibt im Archiv.</p>
</div>`,
  };
}
