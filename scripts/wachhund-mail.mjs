// Verschickt eine Alarm-Mail über das SMTP-Konto der App.
// Aufruf: node wachhund-mail.mjs "Betreff" "Text"
// Nutzt nodemailer aus den node_modules der App und liest die Zugangsdaten
// direkt aus deren .env — keine doppelte Konfiguration.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const APP = "/home/auftragsboss/app";
const require = createRequire(`${APP}/`);
const nodemailer = require("nodemailer");

const env = Object.fromEntries(
  readFileSync(`${APP}/.env`, "utf8")
    .split("\n")
    .filter((z) => /^[A-Z_]+=/.test(z))
    .map((z) => {
      const i = z.indexOf("=");
      return [z.slice(0, i), z.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const port = Number(env.SMTP_PORT || 587);
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const an = env.ADMIN_EMAIL || "beermit2e@gmail.com";
await transport.sendMail({
  from: env.SMTP_FROM || env.SMTP_USER,
  to: an,
  subject: process.argv[2] ?? "AuftragsBoss Wachhund",
  text: `${process.argv[3] ?? ""}\n\n(Automatischer Alarm vom Wachhund-Skript auf dem VPS, ${new Date().toISOString()})`,
});
console.log(`Alarm-Mail an ${an} gesendet.`);
