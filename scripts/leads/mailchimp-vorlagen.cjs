// Baut aus marketing/mailchimp/mailchimp-vorlage.html (Rahmen mit Signatur und Fußzeile) und
// marketing/mailchimp/mailchimp-texte.html (vier Textblöcke) je Mail eine eigene HTML-Datei,
// die sich in Mailchimp über „Email templates → Import HTML" als Vorlage anlegen lässt.
//   node scripts/leads/mailchimp-vorlagen.cjs
const fs = require("fs");
const path = require("path");

const ORDNER = path.join(__dirname, "..", "..", "marketing", "mailchimp");
const vorlage = fs.readFileSync(path.join(ORDNER, "mailchimp-vorlage.html"), "utf8");
const texte = fs.readFileSync(path.join(ORDNER, "mailchimp-texte.html"), "utf8");

// Textblöcke: jeder beginnt mit „<!-- ==== MAIL n, TAG t · Betreff: … ==== -->"
const bloecke = [...texte.matchAll(/<!-- =+ MAIL (\d+), TAG (\d+) · Betreff: (.*?) =+ -->\s*([\s\S]*?)(?=<!-- =+ MAIL|\s*$)/g)]
  .map((m) => ({ nr: +m[1], tag: +m[2], betreff: m[3].trim(), html: m[4].trim() }));
if (bloecke.length !== 4) throw new Error(`Erwartet 4 Textblöcke, gefunden ${bloecke.length}`);

// Textbereich der Vorlage: alles zwischen dem öffnenden <td … mc:edit="text" …> und dem schließenden </td>
const anfang = vorlage.indexOf('mc:edit="text"');
const tdEnde = vorlage.indexOf(">", anfang) + 1;
const schluss = vorlage.indexOf("</td>", tdEnde);
if (anfang < 0 || schluss < 0) throw new Error("Textbereich (mc:edit=\"text\") in der Vorlage nicht gefunden");

for (const b of bloecke) {
  const inhalt = "\n              " + b.html.replace(/\n/g, "\n              ") + "\n            ";
  let html = vorlage.slice(0, tdEnde) + inhalt + vorlage.slice(schluss);
  html = html.replace("<title>*|MC:SUBJECT|*</title>", `<title>${b.betreff}</title>`);
  html = html.replace("<!--\n    AuftragsBoss: Mailchimp-Vorlage „normale E-Mail\" (22.09.2026).", `<!--\n    AuftragsBoss Mail ${b.nr} (Tag ${b.tag}) · Betreff: ${b.betreff}\n    Erzeugt aus mailchimp-vorlage.html + mailchimp-texte.html (scripts/leads/mailchimp-vorlagen.cjs).`);
  if (!html.includes("*|UNSUB|*")) throw new Error("Abmelde-Tag fehlt");
  const datei = path.join(ORDNER, `AuftragsBoss-Mail-${b.nr}-Tag${b.tag}.html`);
  fs.writeFileSync(datei, html, "utf8");
  console.log(`Mail ${b.nr} (Tag ${b.tag}): „${b.betreff}" → ${path.basename(datei)} (${Math.round(html.length / 1024)} KB)`);
}
