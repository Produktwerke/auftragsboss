// Selbst-Registrierung: Ein WhatsApp-verifiziertes Test-Konto wird hier zum
// echten Betrieb. Die Nummer ist bereits belegt (der Interessent hat uns von
// ihr aus geschrieben), deshalb fragen wir nur noch die Stammdaten ab.
//
// Reines HTML/CSS/JS, kein Framework. Schickt die Daten per fetch als JSON an
// POST /api/registrieren/:token.

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function registrierungSeite(opts: {
  token: string;
  firma?: string;
  name?: string;
  email?: string;
  nummer?: string;
}): string {
  const token = esc(opts.token);
  const firma = esc(opts.firma ?? "");
  const name = esc(opts.name ?? "");
  const email = esc(opts.email ?? "");
  const nummer = esc(opts.nummer ?? "");
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Betrieb anmelden · AuftragsBoss</title>
<style>
  :root{ --bg:#15181e; --karte:#1e232b; --rand:#2b323d; --text:#eef1f5; --grau:#9aa4b2;
    --gelb:#ffd21e; --dunkel:#12151a; --fehler:#ff6b6b; --ok:#39d98a; }
  *{box-sizing:border-box}
  body{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .karte{ width:100%; max-width:460px; background:var(--karte); border:1px solid var(--rand);
    border-radius:18px; padding:32px 30px; box-shadow:0 24px 60px rgba(0,0,0,.45); }
  .marke{ font-weight:800; letter-spacing:.5px; font-size:20px; margin-bottom:22px }
  .marke span{ color:var(--gelb) }
  h1{ font-size:22px; margin:0 0 8px; line-height:1.25 }
  p.lead{ margin:0 0 22px; color:var(--grau); font-size:14.5px; line-height:1.55 }
  label{ display:block; font-size:13px; color:var(--grau); margin:14px 0 6px }
  input{ width:100%; padding:13px 14px; font-size:16px; border-radius:11px;
    border:1px solid var(--rand); background:#141922; color:var(--text); outline:none }
  input:focus{ border-color:var(--gelb) }
  input:disabled{ opacity:.6 }
  .nr{ display:flex; align-items:center; gap:8px; background:#141922; border:1px solid var(--rand);
    border-radius:11px; padding:11px 14px; color:var(--grau); font-size:15px }
  .nr b{ color:var(--text) }
  button{ width:100%; margin-top:22px; padding:14px 16px; font-size:16px; font-weight:700;
    border:0; border-radius:11px; background:var(--gelb); color:var(--dunkel); cursor:pointer }
  button:disabled{ opacity:.6; cursor:default }
  .fehler{ margin-top:14px; color:var(--fehler); font-size:14px; min-height:19px; line-height:1.4 }
  .hinweis{ margin-top:18px; padding:12px 14px; border-radius:11px; background:#182029;
    border:1px solid var(--rand); color:var(--grau); font-size:12.5px; line-height:1.55 }
  .hinweis a{ color:var(--gelb) }
  .fertig{ text-align:center }
  .fertig .hk{ font-size:44px; color:var(--ok) }
</style>
</head>
<body>
  <div class="karte" id="karte">
    <div class="marke">AUFTRAGS<span>BOSS</span></div>
    <h1>Deinen Betrieb anmelden</h1>
    <p class="lead">Nur noch ein paar Angaben, dann gehören dein Logo, deine Adresse
      und deine Angebote dir. Danach diktierst du einfach per WhatsApp, kein Login,
      kein Passwort.</p>

    <form id="f" autocomplete="on">
      <label for="firma">Firma / Betriebsname</label>
      <input id="firma" name="firma" type="text" value="${firma}" placeholder="z. B. Malerbetrieb Muster GmbH" required>

      <label for="name">Ansprechpartner (Inhaber)</label>
      <input id="name" name="name" type="text" value="${name}" placeholder="z. B. Max Muster" required>

      <label for="email">E-Mail (für deine fertigen Angebote)</label>
      <input id="email" name="email" type="email" value="${email}" placeholder="z. B. info@malerbetrieb-muster.de" required>

      <label>Deine WhatsApp-Nummer (bestätigt)</label>
      <div class="nr">✅ <b>${nummer || "deine Nummer"}</b>, darüber hast du uns geschrieben.</div>

      <div class="fehler" id="fehler"></div>
      <button id="btn" type="submit">Betrieb anmelden</button>
    </form>

    <div class="hinweis">🔒 AuftragsBoss ist ein KI-gestützter Dienst der DAG Deutsche
      Automotive GmbH. Mit dem Anmelden stimmst du der Verarbeitung deiner Angaben zur
      Bereitstellung des Dienstes zu. <a href="https://auftragsboss.de/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a></div>
  </div>

<script>
  var token = ${JSON.stringify(token)};
  var f = document.getElementById('f');
  var btn = document.getElementById('btn');
  var fehler = document.getElementById('fehler');

  f.addEventListener('submit', async function(e){
    e.preventDefault();
    fehler.textContent = '';
    var firma = document.getElementById('firma').value.trim();
    var name  = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    if (firma.length < 2){ fehler.textContent = 'Bitte gib deinen Firmennamen ein.'; return; }
    if (name.length  < 2){ fehler.textContent = 'Bitte gib den Ansprechpartner ein.'; return; }
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ fehler.textContent = 'Bitte gib eine gültige E-Mail-Adresse ein.'; return; }

    btn.disabled = true; btn.textContent = 'Wird angemeldet…';
    try{
      var r = await fetch('/api/registrieren/' + encodeURIComponent(token), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firma:firma, name:name, email:email })
      });
      var data = {};
      try{ data = await r.json(); }catch(_){}
      if (r.ok && data.ok){
        document.getElementById('karte').innerHTML =
          '<div class="fertig"><div class="hk">✅</div>' +
          '<h1>Willkommen an Bord, ' + (name.split(' ')[0] || '') + '!</h1>' +
          '<p class="lead">Dein Betrieb <b>' + firma.replace(/</g,'&lt;') + '</b> ist angemeldet. ' +
          'Wir haben dir eine E-Mail mit deinem persönlichen Einstellungs-Link geschickt ' +
          '(Logo, Adresse, Standardtexte). Danach einfach per WhatsApp dein erstes Angebot diktieren. 🎙️</p>' +
          (data.cockpitUrl ? '<a href="' + data.cockpitUrl + '"><button>Zu meinen Einstellungen</button></a>' : '');
        return;
      }
      fehler.textContent = data.fehler || 'Das hat leider nicht geklappt. Bitte versuch es noch einmal.';
    }catch(_){
      fehler.textContent = 'Verbindung fehlgeschlagen. Bitte noch einmal versuchen.';
    }
    btn.disabled = false; btn.textContent = 'Betrieb anmelden';
  });
</script>
</body>
</html>`;
}
