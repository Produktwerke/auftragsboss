// Zugangs-Schleuse vor dem Editor (Stufe A / A2).
//
// Erscheint beim ERSTEN Öffnen eines Angebots auf einem Gerät. Fragt die
// Handynummer ab und vergleicht sie serverseitig mit der WhatsApp-Nummer des
// Betriebs. Danach merkt sich das Gerät den Zugang (Cookie) — deshalb der
// deutlich sichtbare Hinweis "nur dieses eine Mal", damit niemand denkt, das
// sei jedes Mal nötig.
//
// Reines HTML/CSS/JS, kein Framework. Schickt die Nummer per fetch als JSON an
// POST /a/:token/zugang und leitet bei Erfolg auf das Angebot weiter.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// AuftragsBoss-Bildmarke einmalig als Data-URI einbetten (selbsttragend, kein
// Static-Route nötig). Fällt bei Fehler einfach weg (nur Wortmarke).
let LOGO_DATA_URI: string | null = null;
try {
  const buf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../assets/auftragsboss-logo-mail.png"));
  LOGO_DATA_URI = "data:image/png;base64," + buf.toString("base64");
} catch {
  LOGO_DATA_URI = null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function schleuseSeite(opts: { token: string }): string {
  const token = esc(opts.token);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Zugang bestätigen · AuftragsBoss</title>
<style>
  :root{
    --bg:#15181e; --karte:#1e232b; --rand:#2b323d; --text:#eef1f5;
    --grau:#9aa4b2; --gelb:#ffd21e; --gelb-dunkel:#12151a; --fehler:#ff6b6b;
  }
  *{box-sizing:border-box}
  body{
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  .karte{
    width:100%; max-width:420px; background:var(--karte); border:1px solid var(--rand);
    border-radius:18px; padding:34px 30px; box-shadow:0 24px 60px rgba(0,0,0,.45);
  }
  .marke{display:flex; align-items:center; gap:11px; margin-bottom:24px}
  .marke img{height:30px; width:auto; display:block}
  .marke .wort{font-weight:800; letter-spacing:.5px; font-size:20px}
  .marke .wort span{color:var(--gelb)}
  h1{font-size:21px; margin:0 0 8px; line-height:1.25}
  p.lead{margin:0 0 20px; color:var(--grau); font-size:14.5px; line-height:1.55}
  label{display:block; font-size:13px; color:var(--grau); margin:0 0 7px}
  input[type=tel]{
    width:100%; padding:14px 15px; font-size:17px; border-radius:11px;
    border:1px solid var(--rand); background:#141922; color:var(--text); outline:none;
  }
  input[type=tel]:focus{border-color:var(--gelb)}
  button{
    width:100%; margin-top:16px; padding:14px 16px; font-size:16px; font-weight:700;
    border:0; border-radius:11px; background:var(--gelb); color:var(--gelb-dunkel);
    cursor:pointer;
  }
  button:disabled{opacity:.6; cursor:default}
  .hinweis{
    margin-top:18px; padding:12px 14px; border-radius:11px; background:#182029;
    border:1px solid var(--rand); color:var(--grau); font-size:13px; line-height:1.5;
    display:flex; gap:9px; align-items:flex-start;
  }
  .hinweis b{color:var(--text)}
  .fehler{margin-top:14px; color:var(--fehler); font-size:14px; min-height:19px; line-height:1.4}
</style>
</head>
<body>
  <div class="karte">
    <div class="marke">${
      LOGO_DATA_URI ? `<img src="${LOGO_DATA_URI}" alt="AuftragsBoss Logo">` : ""
    }<span class="wort">AUFTRAGS<span>BOSS</span></span></div>
    <h1>Kurz bestätigen, dass du es bist</h1>
    <p class="lead">Gib deine Handynummer ein. Dieselbe, mit der dein Betrieb bei
      AuftragsBoss registriert ist. Damit stellen wir sicher, dass niemand
      Fremdes über einen weitergeleiteten Link an dein Angebot kommt.</p>

    <form id="f" autocomplete="off">
      <label for="nr">Deine Handynummer</label>
      <input id="nr" name="nr" type="tel" inputmode="tel"
             placeholder="z. B. 0174 9364823" autofocus>
      <div class="fehler" id="fehler"></div>
      <button id="btn" type="submit">Angebot öffnen</button>
    </form>

    <div class="hinweis">
      <span>🔒</span>
      <span><b>Nur dieses eine Mal auf diesem Gerät.</b> Danach merkt sich dein
        Handy bzw. Computer den Zugang. Beim nächsten Angebot musst du nichts
        mehr eingeben.</span>
    </div>
  </div>

<script>
  var token = ${JSON.stringify(token)};
  var f = document.getElementById('f');
  var nr = document.getElementById('nr');
  var btn = document.getElementById('btn');
  var fehler = document.getElementById('fehler');

  f.addEventListener('submit', async function(e){
    e.preventDefault();
    fehler.textContent = '';
    var wert = nr.value.trim();
    if (wert.length < 5){ fehler.textContent = 'Bitte gib deine Handynummer ein.'; return; }
    btn.disabled = true; btn.textContent = 'Prüfe…';
    try{
      var r = await fetch('/a/' + encodeURIComponent(token) + '/zugang', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nummer: wert })
      });
      if (r.ok){
        // Erfolg → Angebot laden (Gerät ist jetzt vertraut). Kurzer Wurzel-Link.
        window.location.href = '/' + encodeURIComponent(token);
        return;
      }
      var data = {};
      try{ data = await r.json(); }catch(_){}
      if (r.status === 429){
        fehler.textContent = data.fehler || 'Zu viele Versuche. Bitte kurz warten.';
      } else {
        fehler.textContent = data.fehler || 'Diese Nummer passt nicht zum Betrieb.';
      }
    }catch(_){
      fehler.textContent = 'Verbindung fehlgeschlagen. Bitte noch einmal versuchen.';
    }
    btn.disabled = false; btn.textContent = 'Angebot öffnen';
  });
</script>
</body>
</html>`;
}
