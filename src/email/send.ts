// E-Mail-Versand über generisches SMTP — funktioniert mit IONOS, Strato,
// Gmail, Office 365 etc. (bewusst kein US-SaaS-Lock-in für die Zielgruppe).
import nodemailer from "nodemailer";
import { config } from "../config.js";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465, // 465 = implizites TLS, 587 = STARTTLS
  auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
});

export async function sendeMail(an: string, betreff: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: an,
    subject: betreff,
    html,
  });
}
