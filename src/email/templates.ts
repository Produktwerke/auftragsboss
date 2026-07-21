// HTML-E-Mail-Templates. Bewusst simpel gehalten (Inline-Styles) —
// muss in Outlook & Gmail von konservativen Empfängern funktionieren.
import type { ProtokollDaten } from "../ai/structure.js";

const datumDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const box = (inhalt: string, farbe = "#f6f8fa") =>
  `<div style="background:${farbe};border-radius:8px;padding:16px 20px;margin:16px 0;">${inhalt}</div>`;

export function protokollMail(args: {
  daten: ProtokollDaten;
  transkript: string;
  protokollId: string;
  auftragsDatum: Date;
  gewaehrleistungAblauf: Date;
}): { betreff: string; html: string } {
  const { daten, transkript, protokollId, auftragsDatum, gewaehrleistungAblauf } = args;
  const kunde = daten.kunde.name ?? "Unbekannter Kunde";
  const fristJahre = daten.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2;

  const betreff = `📋 Protokoll: ${kunde} — ${datumDE(auftragsDatum)}`;

  const leistungenHtml = daten.auftrag.leistungen
    .map(
      (l) =>
        `<li>${escapeHtml(l.beschreibung)}${l.menge ? ` <em>(${escapeHtml(l.menge)})</em>` : ""}</li>`,
    )
    .join("");

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
  <h2 style="color:#0b5cad;">✅ Dein Protokoll ist fertig</h2>
  <p><strong>Kunde:</strong> ${escapeHtml(kunde)}${daten.kunde.adresse ? ` · ${escapeHtml(daten.kunde.adresse)}` : ""}<br>
     <strong>Datum:</strong> ${datumDE(auftragsDatum)}${daten.auftrag.gewerk ? `<br><strong>Gewerk:</strong> ${escapeHtml(daten.auftrag.gewerk)}` : ""}</p>

  <h3>1️⃣ Protokoll zum Weiterleiten an den Kunden</h3>
  <p style="color:#666;font-size:14px;">Einfach kopieren und per E-Mail oder WhatsApp an den Kunden schicken:</p>
  ${box(`<div style="white-space:pre-wrap;">${escapeHtml(daten.protokoll_text)}</div>`, "#eef6ee")}

  <h3>2️⃣ Interner Archiv-Eintrag</h3>
  ${box(`
    <strong>Leistungen:</strong>
    <ul style="margin:8px 0;">${leistungenHtml}</ul>
    ${daten.auftrag.material.length ? `<strong>Material:</strong> ${escapeHtml(daten.auftrag.material.join(", "))}<br>` : ""}
    ${daten.auftrag.arbeitszeit ? `<strong>Arbeitszeit:</strong> ${escapeHtml(daten.auftrag.arbeitszeit)}<br>` : ""}
    ${daten.auftrag.besonderheiten ? `<strong>⚠️ Besonderheiten/Absprachen:</strong> ${escapeHtml(daten.auftrag.besonderheiten)}<br>` : ""}
    ${daten.auftrag.folgetermin ? `<strong>📅 Folgetermin:</strong> ${escapeHtml(daten.auftrag.folgetermin)}<br>` : ""}
    <span style="color:#888;font-size:13px;">Archiv-Nr. ${protokollId}</span>
  `)}

  <h3>3️⃣ Gewährleistung — automatisch im Blick</h3>
  ${box(
    `<strong>Frist:</strong> ${fristJahre} Jahre (§ 634a BGB — ${escapeHtml(daten.gewaehrleistung.begruendung)})<br>
     <strong>Läuft ab am:</strong> ${datumDE(gewaehrleistungAblauf)}<br>
     <span style="color:#0b5cad;">🔔 Du bekommst automatisch 3 Monate vor Ablauf eine Erinnerung — die perfekte Gelegenheit für ein Wartungsangebot.</span>`,
    "#fff8e6",
  )}

  <details style="margin-top:24px;">
    <summary style="color:#888;cursor:pointer;">Original-Transkript anzeigen (Beweissicherung)</summary>
    <p style="color:#666;font-size:13px;white-space:pre-wrap;">${escapeHtml(transkript)}</p>
  </details>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p style="color:#999;font-size:12px;">VoiceProtokoll Guard · Diktiert per WhatsApp, archiviert für immer.</p>
</div>`;

  return { betreff, html };
}

export function gewaehrleistungsErinnerung(args: {
  art: "VORWARNUNG" | "ABLAUF";
  kunde: string;
  auftragsDatum: Date;
  ablauf: Date;
  protokollId: string;
  protokollText: string;
}): { betreff: string; html: string } {
  const { art, kunde, auftragsDatum, ablauf, protokollId, protokollText } = args;

  if (art === "VORWARNUNG") {
    return {
      betreff: `🔔 Gewährleistung läuft in 3 Monaten ab: ${kunde}`,
      html: `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
  <h2 style="color:#b7791f;">🔔 Gewährleistungs-Erinnerung</h2>
  <p>Die Gewährleistung für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
     (${datumDE(auftragsDatum)}, Archiv-Nr. ${protokollId}) läuft am
     <strong>${datumDE(ablauf)}</strong> ab.</p>
  ${box(
    `<strong>💡 Deine Chance:</strong> Jetzt beim Kunden melden und einen
     <strong>Wartungs- oder Prüftermin</strong> anbieten — bevor die Frist endet.
     Das wirkt professionell und bringt Folgeaufträge.`,
    "#fff8e6",
  )}
  <details><summary style="color:#888;cursor:pointer;">Damaliges Protokoll anzeigen</summary>
    <div style="white-space:pre-wrap;color:#666;font-size:13px;">${escapeHtml(protokollText)}</div>
  </details>
</div>`,
    };
  }

  return {
    betreff: `✅ Gewährleistung abgelaufen: ${kunde}`,
    html: `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
  <h2 style="color:#2e7d32;">✅ Gewährleistung beendet</h2>
  <p>Die Gewährleistungsfrist für den Auftrag bei <strong>${escapeHtml(kunde)}</strong>
     (${datumDE(auftragsDatum)}, Archiv-Nr. ${protokollId}) ist am
     <strong>${datumDE(ablauf)}</strong> abgelaufen. Deine Haftung für diesen
     Auftrag ist damit dokumentiert beendet — das Protokoll bleibt im Archiv.</p>
</div>`,
  };
}
