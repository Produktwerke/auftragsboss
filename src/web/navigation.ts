// Gemeinsame Kopf-/Navigationsleiste für die registrierten Seiten
// (Cockpit, Einstellungen, Import). In einem eigenen Modul, damit sich die
// Seiten nicht gegenseitig importieren müssen.
import type { Handwerker } from "@prisma/client";
import { cockpitLink, einstellungenLink, importLink } from "./tokens.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type NavAktiv = "start" | "import" | "einstellungen";

/** Dunkle Kopfleiste mit Logo/Firma. */
export function topBar(handwerker: Handwerker, logoDataUrl: string | null): string {
  const initiale = (handwerker.firma || "A").trim().charAt(0).toUpperCase();
  return `<div class="topbar">
    ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Logo">` : `<div class="logo-platzhalter">${esc(initiale)}</div>`}
    <div class="wer">
      <b>${esc(handwerker.firma || "Ihr Betrieb")}</b>
      <span>Willkommen zurück${handwerker.name ? ", " + esc(handwerker.name) : ""}</span>
    </div>
  </div>`;
}

/** Reiter-Navigation zwischen Übersicht, Import und Einstellungen. */
export function navLeiste(token: string, aktiv: NavAktiv): string {
  const punkt = (id: NavAktiv, url: string, text: string) =>
    `<a class="nav-tab${aktiv === id ? " aktiv" : ""}" href="${esc(url)}">${text}</a>`;
  return `<nav class="nav">
    ${punkt("start", cockpitLink(token), "Übersicht")}
    ${punkt("import", importLink(token), "Angebot importieren")}
    ${punkt("einstellungen", einstellungenLink(token), "Einstellungen")}
  </nav>`;
}

/** CSS für Kopfleiste und Navigation (in jede Seite eingebettet). */
export function navStyles(): string {
  return `
  .topbar { background:#1f2733; color:#fff; border-radius:14px; padding:16px 20px; display:flex; align-items:center; gap:16px; margin-bottom:14px; }
  .topbar .logo { max-height:44px; max-width:150px; object-fit:contain; background:#fff; border-radius:6px; padding:4px 6px; }
  .topbar .logo-platzhalter { width:44px; height:44px; border-radius:8px; background:var(--akzent); display:flex; align-items:center; justify-content:center; font-weight:800; color:#fff; font-size:18px; }
  .topbar .wer { line-height:1.3; }
  .topbar .wer b { font-size:17px; }
  .topbar .wer span { display:block; font-size:12.5px; color:#aeb6c2; }
  .nav { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
  .nav-tab { text-decoration:none; padding:9px 15px; border-radius:9px; font-size:14px; font-weight:600; color:#41505f; background:#e7eaef; }
  .nav-tab:hover { background:#dce1e7; }
  .nav-tab.aktiv { background:var(--akzent); color:#fff; }`;
}
