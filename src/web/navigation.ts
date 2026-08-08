// Gemeinsame App-Shell für die registrierten Seiten (Cockpit, Angebote,
// Import, Einstellungen). Eine feste, ruhige SaaS-Struktur: dunkle Sidebar
// links (CI-Bezug), heller, großzügiger Arbeitsbereich rechts mit Topbar.
//
// WICHTIG: Das Dashboard-Chrome verwendet bewusst KEINE Kundenfarbe
// (`--akzent`). Die Signalfarbe des Betriebs erscheint ausschließlich in der
// Angebotsvorschau bzw. im generierten Angebot — nicht in Navigation, KPIs,
// Tabellen oder Buttons. So bleibt das Cockpit über alle Betriebe hinweg ruhig
// und professionell.
//
// Selbsttragend: eingebettetes CSS, kein Framework, kein Build.
import { cockpitLink, einstellungenLink, importLink } from "./tokens.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type NavAktiv = "start" | "import" | "einstellungen";

/** Ein Navigationseintrag der Sidebar. */
function navPunkt(url: string, icon: string, text: string, aktiv: boolean): string {
  return `<a class="side-link${aktiv ? " aktiv" : ""}" href="${esc(url)}">
    <span class="side-ic" aria-hidden="true">${icon}</span><span>${esc(text)}</span>
  </a>`;
}

// Schlichte, einheitliche Strich-Icons (inline SVG, currentColor).
const IC = {
  uebersicht: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
  angebote: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/></svg>`,
  import: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
  einstellungen: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.6 15H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4 7.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 5.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V11a2 2 0 1 1 0 4h-.6z"/></svg>`,
};

/** Die App-Shell: Sidebar + Topbar + Inhalt. Alle registrierten Seiten nutzen sie. */
export function appShell(opts: {
  token: string;
  aktiv: NavAktiv;
  handwerker: { firma: string | null; name: string | null };
  logoDataUrl?: string | null; // Kundenlogo — im Chrome NICHT verwendet (nur fürs Angebot)
  titel: string; // Kontext links in der Topbar, z.B. "Übersicht"
  content: string; // Haupt-HTML (rechts)
  headExtra?: string; // seiten-spezifisches <style>
  scriptExtra?: string; // seiten-spezifisches <script> (ohne <script>-Tag)
}): string {
  const { token, aktiv, handwerker: h, titel, content } = opts;
  const firma = h.firma || "Ihr Betrieb";
  const initiale = firma.trim().charAt(0).toUpperCase() || "A";
  const cockpit = cockpitLink(token);

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)} — AuftragsBoss</title>
<style>
${dashStyles()}
${opts.headExtra ?? ""}
</style>
</head>
<body>
<div class="app">
  <input type="checkbox" id="navToggle" class="nav-toggle" hidden>

  <aside class="sidebar" aria-label="Hauptnavigation">
    <div class="brand">
      <span class="brand-mark">A</span>
      <span class="brand-name">Auftrags<b>Boss</b></span>
    </div>
    <nav class="side-nav">
      <div class="side-cap">Arbeitsbereich</div>
      ${navPunkt(cockpit, IC.uebersicht, "Übersicht", aktiv === "start")}
      ${navPunkt(cockpit + "#angebote", IC.angebote, "Angebote", false)}
      ${navPunkt(importLink(token), IC.import, "Angebot importieren", aktiv === "import")}
      <div class="side-cap">Konto</div>
      ${navPunkt(einstellungenLink(token), IC.einstellungen, "Einstellungen", aktiv === "einstellungen")}
    </nav>
    <div class="side-foot">
      <div class="side-firma">
        <span class="side-avatar">${esc(initiale)}</span>
        <span class="side-firma-text"><b>${esc(firma)}</b><small>${h.name ? esc(h.name) : "Angemeldet"}</small></span>
      </div>
    </div>
  </aside>

  <label for="navToggle" class="scrim" aria-hidden="true"></label>

  <div class="main">
    <header class="appbar">
      <label for="navToggle" class="burger" aria-label="Menü">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </label>
      <div class="appbar-title">${esc(titel)}</div>
      <div class="appbar-right">
        <div class="acct">
          <span class="acct-text"><b>${esc(firma)}</b><small>${h.name ? esc(h.name) : "Konto"}</small></span>
          <span class="acct-avatar">${esc(initiale)}</span>
        </div>
      </div>
    </header>
    <main class="content">
${content}
    </main>
  </div>
</div>
${opts.scriptExtra ? `<script>\n${opts.scriptExtra}\n</script>` : ""}
</body>
</html>`;
}

/**
 * Designsystem des Cockpits. Neutral und ruhig: helle Arbeitsfläche, dunkle
 * Anthrazit-Sidebar (CI-Bezug), feine Borders, subtile Schatten. Bewusst OHNE
 * Kundenfarbe — die kommt nur in der Angebotsvorschau vor.
 */
export function dashStyles(): string {
  return `
  :root{
    --app-bg:#f4f6f8; --panel:#ffffff; --panel-2:#fafbfc;
    --line:#e7eaee; --line-2:#dde1e6;
    --ink:#171a1f; --ink-2:#3d434c; --muted:#697180; --faint:#98a0ab;
    --side-bg:#15181e; --side-bg-2:#1b1f27; --side-line:#262b34;
    --side-ink:#c2c8d2; --side-ink-2:#828a97; --side-active:#ffffff;
    --primary:#1c2530; --primary-2:#28323f; --primary-ink:#ffffff;
    --ok:#0f7a57; --ok-bg:#e6f3ee; --warn:#8a6a12; --warn-bg:#f6eed7;
    --neutral:#5b6472; --neutral-bg:#eef0f3;
    --r:10px; --r-sm:8px; --r-lg:14px;
    --shadow:0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
    --font:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    --mono:ui-monospace,"Cascadia Mono","Consolas",monospace;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;}
  body{background:var(--app-bg);color:var(--ink);font-family:var(--font);line-height:1.5;-webkit-font-smoothing:antialiased;}
  a{color:inherit;}
  .num{font-variant-numeric:tabular-nums;}

  /* ---- App-Shell ---- */
  .app{display:flex;min-height:100vh;}
  .sidebar{width:250px;flex:0 0 250px;background:var(--side-bg);color:var(--side-ink);
    display:flex;flex-direction:column;position:sticky;top:0;height:100vh;border-right:1px solid var(--side-line);z-index:40;}
  .brand{display:flex;align-items:center;gap:11px;padding:20px 20px 18px;border-bottom:1px solid var(--side-line);}
  .brand-logo{height:30px;max-width:150px;object-fit:contain;background:#fff;border-radius:6px;padding:3px 5px;}
  .brand-mark{width:30px;height:30px;border-radius:8px;background:var(--brand,#FFC426);color:#1a1400;display:grid;place-items:center;font-weight:900;font-size:16px;}
  .brand-name{font-size:16px;font-weight:800;color:#fff;letter-spacing:.01em;}
  .brand-name b{color:var(--brand,#FFC426);font-weight:800;}
  .side-nav{flex:1;padding:14px 12px;overflow-y:auto;}
  .side-cap{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--side-ink-2);font-weight:700;padding:14px 10px 7px;}
  .side-cap:first-child{padding-top:2px;}
  .side-link{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:var(--r-sm);color:var(--side-ink);
    text-decoration:none;font-size:14px;font-weight:500;margin-bottom:2px;transition:background .12s,color .12s;position:relative;}
  .side-link:hover{background:var(--side-bg-2);color:#fff;}
  .side-ic{display:grid;place-items:center;width:20px;height:20px;color:var(--side-ink-2);flex:0 0 auto;}
  .side-link:hover .side-ic,.side-link.aktiv .side-ic{color:#fff;}
  .side-link.aktiv{background:var(--side-bg-2);color:#fff;font-weight:600;}
  .side-link.aktiv::before{content:"";position:absolute;left:-12px;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:var(--brand,#FFC426);}
  .side-foot{padding:12px;border-top:1px solid var(--side-line);}
  .side-firma{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:var(--r-sm);}
  .side-avatar{width:32px;height:32px;border-radius:8px;background:var(--side-bg-2);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex:0 0 auto;}
  .side-firma-text{line-height:1.25;overflow:hidden;}
  .side-firma-text b{display:block;font-size:13.5px;color:#eef0f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .side-firma-text small{display:block;font-size:11.5px;color:var(--side-ink-2);}

  .main{flex:1;min-width:0;display:flex;flex-direction:column;}
  .appbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;
    height:60px;padding:0 26px;background:rgba(255,255,255,.86);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);}
  .appbar-title{font-size:16px;font-weight:700;color:var(--ink);}
  .appbar-right{margin-left:auto;display:flex;align-items:center;gap:14px;}
  .acct{display:flex;align-items:center;gap:10px;}
  .acct-text{text-align:right;line-height:1.2;}
  .acct-text b{display:block;font-size:13.5px;color:var(--ink);}
  .acct-text small{display:block;font-size:11.5px;color:var(--muted);}
  .acct-avatar{width:34px;height:34px;border-radius:9px;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;}
  .burger{display:none;align-items:center;justify-content:center;width:38px;height:38px;margin-left:-8px;border-radius:9px;color:var(--ink-2);cursor:pointer;}
  .burger:hover{background:var(--neutral-bg);}
  .scrim{display:none;}
  .content{padding:26px 30px 60px;max-width:1320px;width:100%;}

  /* ---- Seitenkopf ---- */
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px;}
  .page-head .greet{font-size:23px;font-weight:800;letter-spacing:-.01em;margin:0 0 3px;}
  .page-head .sub{color:var(--muted);font-size:14.5px;margin:0;}

  /* ---- Panels / Sections ---- */
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow);}
  .panel + .panel{margin-top:18px;}
  .panel-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);}
  .panel-h h2{font-size:15px;font-weight:700;margin:0;letter-spacing:-.01em;}
  .panel-h p{margin:2px 0 0;font-size:12.5px;color:var(--muted);}
  .panel-b{padding:20px;}
  .panel-b.flush{padding:0;}

  .section{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow);margin-bottom:18px;overflow:hidden;}
  .section-h{padding:17px 22px 4px;}
  .section-h h2{font-size:15px;font-weight:700;margin:0;}
  .section-h p{margin:4px 0 0;font-size:12.5px;color:var(--muted);}
  .section-b{padding:16px 22px 22px;}

  /* ---- KPI-Stats ---- */
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:22px;}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow);padding:16px 18px;}
  .stat .k{font-size:12.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:8px;}
  .stat .k .dot{width:7px;height:7px;border-radius:50%;background:var(--neutral);flex:0 0 auto;}
  .stat .k .dot.ok{background:var(--ok);} .stat .k .dot.warn{background:var(--warn);}
  .stat .v{font-size:27px;font-weight:800;letter-spacing:-.02em;margin-top:9px;color:var(--ink);}
  .stat .m{font-size:12px;color:var(--faint);margin-top:2px;}

  /* ---- Buttons ---- */
  .btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line-2);background:var(--panel);color:var(--ink-2);
    border-radius:var(--r-sm);padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;
    transition:background .12s,border-color .12s,box-shadow .12s;font-family:inherit;}
  .btn:hover{background:var(--panel-2);border-color:var(--line-2);}
  .btn svg{width:16px;height:16px;}
  .btn.prim{background:var(--primary);border-color:var(--primary);color:var(--primary-ink);}
  .btn.prim:hover{background:var(--primary-2);border-color:var(--primary-2);}
  .btn.ghost{border-color:transparent;background:transparent;}
  .btn.ghost:hover{background:var(--neutral-bg);}
  .btn.sm{padding:7px 11px;font-size:12.5px;}
  .btn:disabled{opacity:.55;cursor:default;}

  /* ---- Toolbar (Suche + Filter) ---- */
  .toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--line);}
  .search{position:relative;flex:1;min-width:220px;}
  .search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--faint);pointer-events:none;}
  .search input{width:100%;padding:9px 12px 9px 36px;border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13.5px;
    background:var(--panel-2);color:var(--ink);font-family:inherit;}
  .search input:focus{outline:none;border-color:var(--ink-2);background:var(--panel);box-shadow:0 0 0 3px rgba(23,26,31,.06);}
  .seg{display:inline-flex;background:var(--neutral-bg);border-radius:var(--r-sm);padding:3px;gap:2px;}
  .seg button{border:0;background:none;padding:6px 12px;border-radius:6px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;font-family:inherit;}
  .seg button.on{background:var(--panel);color:var(--ink);box-shadow:var(--shadow);}

  /* ---- Datentabelle ---- */
  .dtable-wrap{overflow-x:auto;}
  .dtable{width:100%;border-collapse:collapse;}
  .dtable th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;
    padding:11px 20px;border-bottom:1px solid var(--line);background:var(--panel-2);white-space:nowrap;}
  .dtable th.r,.dtable td.r{text-align:right;}
  .dtable td{padding:14px 20px;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink-2);vertical-align:middle;}
  .dtable tbody tr{cursor:pointer;transition:background .1s;}
  .dtable tbody tr:hover{background:var(--panel-2);}
  .dtable tbody tr:last-child td{border-bottom:none;}
  .dtable .t-num{font-weight:700;color:var(--ink);}
  .dtable .t-num a{text-decoration:none;color:inherit;}
  .dtable .t-sub{color:var(--faint);font-weight:500;font-size:12px;margin-left:6px;}
  .dtable .t-amount{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;}
  .empty-row td{text-align:center;color:var(--faint);padding:40px 20px;font-size:14px;}
  .empty-search{display:none;text-align:center;color:var(--faint);padding:26px;font-size:14px;}

  /* ---- Status-Badges (dezent, keine Signalfarbe) ---- */
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;line-height:1.2;white-space:nowrap;}
  .badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9;}
  .badge.ok{background:var(--ok-bg);color:var(--ok);}
  .badge.warn{background:var(--warn-bg);color:var(--warn);}
  .badge.neutral{background:var(--neutral-bg);color:var(--neutral);}

  /* ---- Formulare ---- */
  .field{margin-bottom:14px;}
  .field:last-child{margin-bottom:0;}
  .field label{display:block;font-size:13px;font-weight:600;color:var(--ink-2);margin-bottom:6px;}
  .field .hint{display:block;font-size:12px;color:var(--faint);margin:5px 0 0;font-weight:400;}
  .field input,.field textarea,.field select{width:100%;padding:9px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);
    font-size:14px;font-family:inherit;background:var(--panel);color:var(--ink);}
  .field textarea{min-height:88px;resize:vertical;}
  .field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:var(--ink-2);box-shadow:0 0 0 3px rgba(23,26,31,.06);}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .check{display:flex;align-items:flex-start;gap:11px;cursor:pointer;font-weight:500;color:var(--ink-2);font-size:14px;}
  .check input{width:auto;margin-top:2px;}

  .statusmsg{font-size:13px;font-weight:600;}

  /* ---- Responsive: Sidebar wird zum Drawer ---- */
  @media (max-width:960px){
    .sidebar{position:fixed;left:0;top:0;height:100vh;transform:translateX(-100%);transition:transform .2s ease;box-shadow:0 10px 40px rgba(0,0,0,.3);}
    .nav-toggle:checked ~ .sidebar{transform:translateX(0);}
    .scrim{display:block;position:fixed;inset:0;background:rgba(10,12,16,.45);opacity:0;pointer-events:none;transition:opacity .2s;z-index:35;}
    .nav-toggle:checked ~ .scrim{opacity:1;pointer-events:auto;}
    .burger{display:inline-flex;}
    .appbar-title{font-size:15px;}
  }
  @media (max-width:640px){
    .content{padding:18px 16px 48px;}
    .appbar{padding:0 16px;}
    .acct-text{display:none;}
    .grid2{grid-template-columns:1fr;}
    .page-head{align-items:flex-start;}
  }`;
}
