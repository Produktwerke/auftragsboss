// Öffentliche "Jetzt testen"-Seite mit Aufnahmeknopf.
//
// Anonymer Besucher: Knopf drücken, Malerauftrag diktieren, landet im echten
// Editor mit fertigem Angebot. Kein Login, kein Download. Selbst ausgeliefert
// vom Server (gleiche Domain wie die API) — deshalb kein CORS nötig.
// Bewusst framework-frei (ein HTML-String, Vanilla-JS).

export function testSeite(): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AuftragsBoss — Jetzt kostenlos testen</title>
<style>
  :root{ --anthra:#14171a; --karte:#1e2329; --gelb:#ffd60a; --text:#f2f4f6; --grau:#9aa3ad; }
  *{ box-sizing:border-box; }
  body{ margin:0; min-height:100vh; background:var(--anthra); color:var(--text);
    font-family:-apple-system,"Segoe UI",Roboto,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; }
  .marke{ font-weight:800; letter-spacing:.5px; font-size:20px; margin-bottom:28px; }
  .marke span{ color:var(--gelb); }
  h1{ font-size:26px; line-height:1.25; text-align:center; margin:0 0 8px; max-width:520px; }
  .unter{ color:var(--grau); text-align:center; margin:0 0 32px; max-width:460px; }
  .knopf{ width:150px; height:150px; border-radius:50%; border:none; cursor:pointer;
    background:var(--gelb); color:#1a1a1a; font-size:17px; font-weight:700; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:8px; box-shadow:0 10px 30px rgba(255,214,10,.25); transition:transform .1s; }
  .knopf:active{ transform:scale(.97); }
  .knopf.laeuft{ background:#ff4d4d; color:#fff; box-shadow:0 0 0 8px rgba(255,77,77,.18); animation:puls 1.4s infinite; }
  .knopf .mic{ font-size:38px; }
  @keyframes puls{ 0%{ box-shadow:0 0 0 6px rgba(255,77,77,.28);} 70%{ box-shadow:0 0 0 20px rgba(255,77,77,0);} 100%{ box-shadow:0 0 0 0 rgba(255,77,77,0);} }
  .timer{ font-variant-numeric:tabular-nums; font-size:15px; color:var(--grau); height:20px; margin-top:14px; }
  .beispiel{ margin-top:22px; background:none; border:1px solid #333a42; color:var(--text); padding:11px 18px; border-radius:10px; cursor:pointer; font-size:15px; }
  .beispiel:hover{ border-color:var(--gelb); }
  .status{ margin-top:22px; min-height:22px; text-align:center; color:var(--gelb); font-size:15px; max-width:460px; }
  .trust{ margin-top:40px; color:var(--grau); font-size:13px; text-align:center; max-width:420px; }
  .laden{ display:inline-block; width:16px; height:16px; border:2px solid var(--gelb); border-top-color:transparent; border-radius:50%; animation:dreh .8s linear infinite; vertical-align:-3px; margin-right:8px; }
  @keyframes dreh{ to{ transform:rotate(360deg);} }
</style>
</head>
<body>
  <div class="marke">AUFTRAGS<span>BOSS</span></div>
  <h1>Diktier dein erstes Malerangebot</h1>
  <p class="unter">Drück auf den Knopf und sprich, was gemacht werden soll: Kunde, Raum, Maße, Leistungen. Den Rest macht AuftragsBoss.</p>

  <button id="knopf" class="knopf"><span class="mic">🎙️</span><span id="knopfText">Aufnahme starten</span></button>
  <div class="timer" id="timer"></div>

  <button class="beispiel" id="beispiel">Kein Mikro? Beispiel ansehen</button>
  <div class="status" id="status"></div>

  <p class="trust">Kein Login, kein Download. Nicht genannte Preise bleiben leer, AuftragsBoss erfindet keine Preise.</p>

<script>
  var knopf = document.getElementById('knopf');
  var knopfText = document.getElementById('knopfText');
  var timerEl = document.getElementById('timer');
  var statusEl = document.getElementById('status');
  var beispielBtn = document.getElementById('beispiel');
  var recorder = null, chunks = [], stream = null, timer = null, start = 0, busy = false;

  function setStatus(t, laden){ statusEl.innerHTML = (laden ? '<span class="laden"></span>' : '') + (t||''); }
  function ticker(){
    var s = Math.floor((Date.now()-start)/1000);
    timerEl.textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  }

  async function starteAufnahme(){
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    }catch(e){
      setStatus('Ich brauche Zugriff auf dein Mikrofon. Erlaube ihn und versuch es noch einmal, oder nimm das Beispiel.');
      return;
    }
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function(){
      var typ = (recorder && recorder.mimeType) || 'audio/webm';
      var blob = new Blob(chunks, { type: typ });
      if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); }
      sendeAudio(blob, typ);
    };
    recorder.start();
    start = Date.now(); ticker(); timer = setInterval(ticker, 500);
    knopf.classList.add('laeuft'); knopfText.textContent = 'Fertig? Tippen'; setStatus('');
  }

  function stoppeAufnahme(){
    clearInterval(timer); timerEl.textContent='';
    knopf.classList.remove('laeuft'); knopfText.textContent = 'Aufnahme starten';
    if(recorder && recorder.state !== 'inactive') recorder.stop();
  }

  knopf.addEventListener('click', function(){
    if(busy) return;
    if(recorder && recorder.state === 'recording'){ stoppeAufnahme(); }
    else { starteAufnahme(); }
  });

  function blobZuBase64(blob){
    return new Promise(function(res){
      var r = new FileReader();
      r.onloadend = function(){ res(String(r.result).split(',')[1]); };
      r.readAsDataURL(blob);
    });
  }

  async function sendeAudio(blob, typ){
    busy = true; setStatus('Ich erstelle dein Angebot, einen kurzen Moment', true);
    try{
      var b64 = await blobZuBase64(blob);
      var r = await fetch('/api/testen/audio', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ audio:b64, mime:typ }) });
      await weiter(r);
    }catch(e){ setStatus('Das hat leider nicht geklappt. Versuch es noch einmal.'); busy=false; }
  }

  beispielBtn.addEventListener('click', async function(){
    if(busy) return; busy = true; setStatus('Ich erstelle ein Beispiel-Angebot, einen kurzen Moment', true);
    try{
      var r = await fetch('/api/testen/beispiel', { method:'POST' });
      await weiter(r);
    }catch(e){ setStatus('Das hat leider nicht geklappt. Versuch es noch einmal.'); busy=false; }
  });

  async function weiter(r){
    var j = {};
    try{ j = await r.json(); }catch(e){}
    if(r.ok && j.editorUrl){ setStatus('Fertig! Ich öffne dein Angebot', true); location.href = j.editorUrl; }
    else { setStatus(j.fehler || 'Das hat leider nicht geklappt. Versuch es noch einmal.'); busy = false; }
  }
</script>
</body>
</html>`;
}
