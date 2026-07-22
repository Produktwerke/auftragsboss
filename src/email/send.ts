// E-Mail-Versand über generisches SMTP — funktioniert mit IONOS, Strato,
// Gmail, Office 365 etc. (bewusst kein US-SaaS-Lock-in für die Zielgruppe).
import nodemailer, { type Transporter } from "nodemailer";
import { emailConfig } from "../config.js";

let transporter: Transporter | undefined;

function holeTransporter(): Transporter {
  if (transporter) return transporter;
  const cfg = emailConfig();
  transporter = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_PORT === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
  });
  return transporter;
}

export async function sendeMail(an: string, betreff: string, html: string): Promise<void> {
  await holeTransporter().sendMail({
    from: emailConfig().SMTP_FROM,
    to: an,
    subject: betreff,
    html,
  });
}
