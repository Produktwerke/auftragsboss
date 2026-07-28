// Einladungs-Landingpage: Das sieht ein Kollege, der über den persönlichen
// Empfehlungslink eines Betriebs kommt. Er trägt sich als Lead ein — beide
// bekommen 1 Monat gratis. Selbsttragend (HTML+JS, kein Framework).

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function einladungSeite(args: { code: string; werberFirma: string }): string {
  const { code, werberFirma } = args;
  const akzent = "#0B5CAD";
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Einladung zu Angebotsblitz</title>
<style>
  :root { --akzent:${akzent}; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; background:#eef0f3; color:#1a1a1a; line-height:1.55; }
  .rahmen { max-width:520px; margin:0 auto; padding:24px 16px 40px; }
  .marke { font-size:22px; font-weight:800; color:var(--akzent); letter-spacing:-.3px; }
  .karte { background:#fff; border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 2px 10px rgba(0,0,0,.08); }
  .gruss { font-size:15px; color:#555; }
  h1 { font-size:24px; margin:6px 0 10px; text-wrap:balance; }
  .geschenk { background:#eaf5ec; color:#1e7a34; border-radius:10px; padding:12px 14px; font-weight:600; font-size:15px; margin:14px 0 4px; }
  ul.nutzen { list-style:none; padding:0; margin:16px 0; }
  ul.nutzen li { padding:6px 0 6px 26px; position:relative; font-size:15px; }
  ul.nutzen li::before { content:"✓"; position:absolute; left:0; color:var(--akzent); font-weight:800; }
  label { display:block; font-size:13px; color:#555; margin:14px 0 4px; font-weight:600; }
  input { width:100%; padding:11px 12px; border:1px solid #cfd4da; border-radius:8px; font-size:16px; font-family:inherit; }
  input:focus { outline:2px solid var(--akzent); border-color:var(--akzent); }
  .btn { width:100%; margin-top:18px; border:none; border-radius:9px; padding:14px; font-size:16px; font-weight:700; cursor:pointer; background:var(--akzent); color:#fff; }
  .btn:hover { filter:brightness(.95); }
  .btn:disabled { opacity:.6; cursor:default; }
  .fehler { color:#c0392b; font-size:14px; margin-top:10px; min-height:18px; }
  .klein { font-size:12px; color:#888; margin-top:14px; }
  .danke { text-align:center; padding:10px 0; }
  .danke .haken { font-size:44px; }
  .danke h2 { margin:6px 0; }
</style>
</head>
<body>
<div class="rahmen">
  <div class="marke">Angebotsblitz</div>

  <div class="karte" id="karte">
    <div class="gruss"><strong>${escapeHtml(werberFirma)}</strong> lädt dich ein zu</div>
    <h1>Angebote diktieren statt tippen.</h1>
    <p>Sprich nach dem Kundentermin einfach eine WhatsApp-Sprachnachricht — du bekommst ein fertiges Angebot zurück. Keine App, kein Login.</p>

    <div class="geschenk">🎁 Ihr bekommt beide 1 Monat gratis.</div>

    <ul class="nutzen">
      <li>Fertiges Angebot aus einer Sprachnachricht</li>
      <li>Mit deinem Logo und Briefkopf, als PDF oder Word</li>
      <li>Läuft komplett über WhatsApp — nichts zu installieren</li>
    </ul>

    <label>Firma</label>
    <input id="firma" placeholder="z. B. Malerbetrieb Müller">
    <label>Dein Name</label>
    <input id="name" placeholder="Vor- und Nachname">
    <label>WhatsApp-Nummer</label>
    <input id="nummer" inputmode="tel" placeholder="z. B. 0176 12345678">
    <label>E-Mail (optional)</label>
    <input id="email" type="email" placeholder="fuer Rueckfragen">

    <button class="btn" id="senden">Gratis-Monat sichern</button>
    <div class="fehler" id="fehler"></div>
    <p class="klein">Wir melden uns und schalten dich frei. Kein Abo, keine Kündigung nötig, solange du nur den Gratis-Monat nutzt.</p>
  </div>
</div>

<script>
const CODE = ${JSON.stringify(code)};
const val = id => document.getElementById(id).value.trim();
const btn = document.getElementById("senden");

btn.addEventListener("click", async () => {
  const daten = { firma: val("firma"), name: val("name"), nummer: val("nummer"), email: val("email") };
  const fehler = document.getElementById("fehler");
  if (daten.firma.length < 2 || daten.name.length < 2 || daten.nummer.replace(/\\D/g,"").length < 6) {
    fehler.textContent = "Bitte Firma, Name und eine gültige WhatsApp-Nummer angeben.";
    return;
  }
  fehler.textContent = "";
  btn.disabled = true; btn.textContent = "Wird gesendet …";
  try {
    const r = await fetch("/api/einladung/" + CODE, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(daten) });
    if (!r.ok) throw 0;
    document.getElementById("karte").innerHTML =
      '<div class="danke"><div class="haken">✅</div><h2>Geschafft!</h2>' +
      '<p>Danke, ' + (daten.name.split(" ")[0] || "") + '. Wir melden uns in Kürze und schalten dich frei — dein Gratis-Monat ist reserviert.</p></div>';
  } catch(e) {
    btn.disabled = false; btn.textContent = "Gratis-Monat sichern";
    fehler.textContent = "Das hat nicht geklappt. Bitte versuche es gleich noch einmal.";
  }
});
</script>
</body>
</html>`;
}
