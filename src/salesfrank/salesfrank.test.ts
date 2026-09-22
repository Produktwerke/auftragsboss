import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { entscheide, parseEinschaetzung, type Einschaetzung } from "./auswertung.js";
import { liesPayload, verarbeiteSalesFrankAnruf, ladeSalesFrankAnrufEin, verwerfeSalesFrankAnruf, raeumeSalesFrankPruefungAuf, OHNE_GESPRAECH, anredeAusFirma } from "./verarbeitung.js";
import { salesfrankWebhookUrl } from "./webhook.js";
import type { LeadSender } from "../lead/onboarding.js";

const ja: Einschaetzung = { interesse: "JA", whatsappZustimmung: "JA", anrede: "Herr Müller", handynummer: null, beleg: "Ja, schicken Sie mir das per WhatsApp.", begruendung: "klare Zustimmung", gespraechsart: "GESPRAECH" };

function fakePrisma(v: { vorhanden?: unknown; anruf?: unknown; anrufe?: Record<string, unknown> } = {}) {
  const aufrufe: Record<string, unknown[]> = { anrufCreate: [], anrufUpdate: [], hwCreate: [], adminLog: [], events: [] };
  const p = {
    salesFrankAnruf: {
      findUnique: vi.fn(async (a: { where: { callId?: string; id?: string } }) => (a.where.callId ? v.anruf ?? null : v.anrufe?.[a.where.id!] ?? null)),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { aufrufe.anrufCreate.push(a.data); return { id: "sf1", ...a.data }; }),
      update: vi.fn(async (a: unknown) => { aufrufe.anrufUpdate.push(a); return {}; }),
    },
    handwerker: {
      findUnique: vi.fn(async () => v.vorhanden ?? null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { aufrufe.hwCreate.push(a.data); return { id: "hw1", ...a.data }; }),
    },
    adminLog: { create: vi.fn(async (a: { data: unknown }) => { aufrufe.adminLog.push(a.data); return {}; }) },
    event: { create: vi.fn(async (a: unknown) => { aufrufe.events.push(a); return {}; }) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}
function fakeSender(ok = true) {
  const gesendet: unknown[][] = [];
  const sender: LeadSender = {
    vorlage: vi.fn(async (...args: unknown[]) => { gesendet.push(args); return ok; }) as never,
    text: vi.fn(async () => {}) as never,
    knoepfe: vi.fn(async () => true) as never,
  };
  return { sender, gesendet };
}
const payload = (extra: Partial<ReturnType<typeof liesPayload>> = {}) => ({
  callId: "c1", telefon: "+49 176 1234567", name: "Maler Müller", firma: "Maler Müller GmbH", anrede: "", ergebnis: "interested",
  zusammenfassung: "Herr Müller möchte AuftragsBoss testen und bekommt eine WhatsApp.", transkript: "… Ja, schicken Sie mir das per WhatsApp. …", ...extra,
});

describe("SalesFrank: Entscheidung und Antwort-Parser", () => {
  it("nur klares Ja + Ja mit Beleg lädt ein; ein Nein lehnt ab; sonst Prüfung", () => {
    expect(entscheide(ja)).toBe("EINLADEN");
    expect(entscheide({ ...ja, beleg: "" })).toBe("PRUEFUNG");
    expect(entscheide({ ...ja, whatsappZustimmung: "UNKLAR" })).toBe("PRUEFUNG");
    expect(entscheide({ ...ja, interesse: "UNKLAR" })).toBe("PRUEFUNG");
    expect(entscheide({ ...ja, whatsappZustimmung: "NEIN" })).toBe("ABLEHNEN");
    expect(entscheide({ ...ja, interesse: "NEIN", whatsappZustimmung: "UNKLAR" })).toBe("ABLEHNEN");
    // Mailbox, Abbruch, Rückrufwunsch: kein Prüffall, kein Nein
    expect(entscheide({ ...ja, interesse: "UNKLAR", whatsappZustimmung: "UNKLAR", beleg: "", gespraechsart: "MAILBOX" })).toBe("KEIN_GESPRAECH");
    expect(entscheide({ ...ja, interesse: "NEIN", whatsappZustimmung: "UNKLAR", gespraechsart: "ABBRUCH" })).toBe("KEIN_GESPRAECH");
    expect(entscheide({ ...ja, interesse: "UNKLAR", whatsappZustimmung: "UNKLAR", beleg: "", gespraechsart: "RUECKRUF" })).toBe("KEIN_GESPRAECH");
    expect(entscheide({ ...ja, gespraechsart: "RUECKRUF" })).toBe("EINLADEN");
  });
  it("SalesFrank-Ergebnis ohne Mensch wird ohne KI übersprungen", async () => {
    expect(OHNE_GESPRAECH.test("no_answer / MACHINE")).toBe(true);
    expect(OHNE_GESPRAECH.test("answered / interested")).toBe(false);
    const { p, aufrufe } = fakePrisma();
    let bewertet = false;
    const erg = await verarbeiteSalesFrankAnruf(p, payload({ ergebnis: "answered / MACHINE / voicemail" }), { bewerte: async () => { bewertet = true; return ja; } });
    expect(erg.aktion).toBe("kein-gespraech");
    expect(bewertet).toBe(false);
    expect(aufrufe.anrufCreate.length).toBe(0);
  });
  it("Mailbox laut KI → KEIN_GESPRAECH ohne Nummer und Transkript", async () => {
    const { p, aufrufe } = fakePrisma();
    const erg = await verarbeiteSalesFrankAnruf(p, payload(), { bewerte: async () => ({ ...ja, interesse: "UNKLAR", whatsappZustimmung: "UNKLAR", beleg: "", gespraechsart: "MAILBOX" }) });
    expect(erg.aktion).toBe("KEIN_GESPRAECH");
    expect(aufrufe.anrufCreate[0]).toMatchObject({ status: "KEIN_GESPRAECH", nummer: null, transkript: "", einschaetzung: "MAILBOX" });
  });
  it("Aufräumen schließt nur Prüffälle ohne Beleg mit Mailbox-/Abbruch-Begründung", async () => {
    const { p, aufrufe } = fakePrisma();
    (p as unknown as { salesFrankAnruf: { findMany: unknown } }).salesFrankAnruf.findMany = async () => [
      { id: "a", begruendung: "Es wurde nur ein Anrufbeantworter erreicht.", beleg: "" },
      { id: "b", begruendung: "Der Angerufene bestätigte nur seine Zuständigkeit.", beleg: "" },
      { id: "c", begruendung: "Das Gespräch brach nach der Begrüßung ab.", beleg: "ja gerne" },
    ];
    expect(await raeumeSalesFrankPruefungAuf(p)).toBe(1);
    expect(aufrufe.anrufUpdate.length).toBe(1);
    expect(aufrufe.anrufUpdate[0]).toMatchObject({ where: { id: "a" }, data: { status: "KEIN_GESPRAECH", nummer: null } });
  });
  it("liest JSON auch aus umgebendem Text, unbekannte Werte werden UNKLAR", () => {
    const e = parseEinschaetzung(`Hier: {"interesse":"ja","whatsappZustimmung":"vielleicht","anrede":"Frau Kurz","handynummer":"0151 22 33 44 5","beleg":"ja gerne","begruendung":"ok"} fertig`, "Firma");
    expect(e.interesse).toBe("JA");
    expect(e.whatsappZustimmung).toBe("UNKLAR");
    expect(e.anrede).toBe("Frau Kurz");
    expect(e.handynummer).toBe("01512233445");
    expect(parseEinschaetzung("kein json", "Firma X")).toMatchObject({ interesse: "UNKLAR", anrede: "Firma X" });
  });
});

describe("SalesFrank: neutrale Anrede aus dem Firmennamen", () => {
  it("kürzt an Doppelpunkt, Strich, Klammer und Pipe; sonst unverändert", () => {
    expect(anredeAusFirma("Maler & Trockenbau Jobst GmbH: Malermeisterbetrieb Weingarten")).toBe("Maler & Trockenbau Jobst GmbH");
    expect(anredeAusFirma("Wandmanufaktur | Thomas Beideck")).toBe("Wandmanufaktur");
    expect(anredeAusFirma("FischerStuck (Büro & Rechnungsadresse)")).toBe("FischerStuck");
    expect(anredeAusFirma("Belis Art - Farbe Putz Boden")).toBe("Belis Art");
    expect(anredeAusFirma("Malermeister Effectus")).toBe("Malermeister Effectus");
    expect(anredeAusFirma("")).toBe("");
  });
  it("mit genehmigter neutraler Vorlage (LEAD_VORLAGE_NEUTRAL) geht die Einladung ohne Platzhalter raus", async () => {
    process.env.LEAD_VORLAGE_NEUTRAL = "angebot_ausprobieren_neutral";
    try {
      const { p, aufrufe } = fakePrisma();
      const { sender, gesendet } = fakeSender();
      const erg = await verarbeiteSalesFrankAnruf(p, payload(), { bewerte: async () => ja, sender });
      expect(erg.aktion).toBe("EINGELADEN");
      expect(gesendet[0]?.[1]).toBe("angebot_ausprobieren_neutral");
      expect(gesendet[0]?.[2]).toEqual([]);
      expect(aufrufe.hwCreate[0]).toMatchObject({ name: "" });
    } finally {
      delete process.env.LEAD_VORLAGE_NEUTRAL;
    }
  });
  it("die Einladung ist immer neutral, auch wenn ein Name gefallen ist", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    await verarbeiteSalesFrankAnruf(p, payload({ firma: "Maler Daief GmbH: Fassaden & Innen" }), { bewerte: async () => ({ ...ja, anrede: "Herr Daief" }), sender });
    expect(aufrufe.hwCreate[0]).toMatchObject({ name: "zusammen", firma: "Maler Daief GmbH: Fassaden & Innen" });
    expect(gesendet[0]?.[2]).toEqual(["zusammen"]);
  });
});

describe("SalesFrank: Webhook-Body lesen", () => {
  it("unsere Vorlage und flache Varianten", () => {
    const p = liesPayload({ event: "call.completed", call: { id: "abc", outcome: "answered", result: "interested", summary: "S", transcript: "T" }, lead: { name: "N", phone: "+49123", company: "F", custom_variables: { anrede: "Herr N" } } });
    expect(p).toMatchObject({ callId: "abc", telefon: "+49123", firma: "F", anrede: "Herr N", zusammenfassung: "S", transkript: "T", ergebnis: "answered / interested" });
    expect(liesPayload({ call_id: "x", phone_number: "+49", first_name: "A", company_name: "B" })).toMatchObject({ callId: "x", firma: "B" });
    expect(liesPayload({ data: { call: { id: "d1", transcript: "T" }, lead: { phone: "+49" } } })).toMatchObject({ callId: "d1", transkript: "T" });
    expect(liesPayload({})).toBeNull();
    expect(liesPayload("quatsch")).toBeNull();
  });
  it("Webhook-Adresse nur mit Geheimnis", () => {
    expect(salesfrankWebhookUrl("https://api.x.de/", { SALESFRANK_WEBHOOK_SECRET: "geheim" })).toBe("https://api.x.de/webhook/salesfrank/geheim");
    expect(salesfrankWebhookUrl("https://api.x.de", {})).toBeNull();
  });
});

describe("SalesFrank: Anruf verarbeiten", () => {
  it("klare Zustimmung + Handynummer → Einladung wie Telefon-Lead, Opt-in-Quelle salesfrank:<callId>", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    const erg = await verarbeiteSalesFrankAnruf(p, payload(), { bewerte: async () => ja, sender });
    expect(erg.aktion).toBe("EINGELADEN");
    expect(aufrufe.hwCreate[0]).toMatchObject({ whatsappNummer: "491761234567", name: "zusammen", firma: "Maler Müller GmbH", optInQuelle: "salesfrank:c1", leadQuelle: "TELEFON" });
    expect(gesendet[0]?.[2]).toEqual(["zusammen"]); // Vorlage: „Hallo zusammen, danke für das nette Telefonat eben!"
    expect(aufrufe.anrufCreate[0]).toMatchObject({ callId: "c1", status: "EINGELADEN", einschaetzung: "JA", nummer: "491761234567", handwerkerId: "hw1", beleg: ja.beleg });
    expect(aufrufe.adminLog[0]).toMatchObject({ aktion: "SALESFRANK_EINGELADEN" });
  });
  it("im Gespräch genannte Handynummer hat Vorrang vor der angerufenen Festnetznummer", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender } = fakeSender();
    const erg = await verarbeiteSalesFrankAnruf(p, payload({ telefon: "+49 711 123456" }), { bewerte: async () => ({ ...ja, handynummer: "01709998877" }), sender });
    expect(erg.aktion).toBe("EINGELADEN");
    expect(aufrufe.hwCreate[0]).toMatchObject({ whatsappNummer: "491709998877" });
  });
  it("Zustimmung, aber nur Festnetz bekannt → Prüfung mit Hinweis, keine Einladung", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    const erg = await verarbeiteSalesFrankAnruf(p, payload({ telefon: "+49 711 123456" }), { bewerte: async () => ja, sender });
    expect(erg.aktion).toBe("PRUEFUNG");
    expect(gesendet.length).toBe(0);
    expect(aufrufe.anrufCreate[0]).toMatchObject({ status: "PRUEFUNG", nummer: "49711123456" });
  });
  it("unklare Zustimmung → Prüfung mit Nummer und Transkript; Absage → ohne Nummer und Transkript", async () => {
    const a = fakePrisma();
    await verarbeiteSalesFrankAnruf(a.p, payload(), { bewerte: async () => ({ ...ja, whatsappZustimmung: "UNKLAR" }), sender: fakeSender().sender });
    expect(a.aufrufe.anrufCreate[0]).toMatchObject({ status: "PRUEFUNG", einschaetzung: "UNKLAR", nummer: "491761234567", transkript: payload().transkript });
    const b = fakePrisma();
    const erg = await verarbeiteSalesFrankAnruf(b.p, payload(), { bewerte: async () => ({ ...ja, interesse: "NEIN" }), sender: fakeSender().sender });
    expect(erg.aktion).toBe("ABGELEHNT");
    expect(b.aufrufe.anrufCreate[0]).toMatchObject({ status: "ABGELEHNT", nummer: null, transkript: "" });
    expect(b.aufrufe.hwCreate.length).toBe(0);
  });
  it("Nummer schon im System → keine zweite Einladung; doppelter Anruf und Anruf ohne Inhalt werden ignoriert", async () => {
    const a = fakePrisma({ vorhanden: { id: "hwX", firma: "Bestand GmbH", name: "" } });
    const erg = await verarbeiteSalesFrankAnruf(a.p, payload(), { bewerte: async () => ja, sender: fakeSender().sender });
    expect(erg.aktion).toBe("SCHON_VORHANDEN");
    expect(a.aufrufe.hwCreate.length).toBe(0);
    const b = fakePrisma({ anruf: { id: "sf0" } });
    expect((await verarbeiteSalesFrankAnruf(b.p, payload(), { bewerte: async () => ja })).aktion).toBe("doppelt");
    const c = fakePrisma();
    expect((await verarbeiteSalesFrankAnruf(c.p, payload({ transkript: "", zusammenfassung: "" }), { bewerte: async () => ja })).aktion).toBe("kein-gespraech");
    expect(c.aufrufe.anrufCreate.length).toBe(0);
  });
  it("Einladung schlägt fehl (Vorlage) → Status FEHLER, Lead bleibt", async () => {
    const { p, aufrufe } = fakePrisma();
    const erg = await verarbeiteSalesFrankAnruf(p, payload(), { bewerte: async () => ja, sender: fakeSender(false).sender });
    expect(erg.aktion).toBe("FEHLER");
    expect(aufrufe.anrufCreate[0]).toMatchObject({ status: "FEHLER" });
  });
});

describe("SalesFrank: Betreiber lädt ein oder verwirft", () => {
  const offen = { id: "sf1", callId: "c9", status: "PRUEFUNG", nummer: "49711123456", anrede: "Herr Kurz", firma: "Kurz GmbH", name: "" };
  it("Einladen braucht eine Handynummer, setzt Status EINGELADEN", async () => {
    const { p, aufrufe } = fakePrisma({ anrufe: { sf1: offen } });
    const { sender } = fakeSender();
    expect(await ladeSalesFrankAnrufEin(p, "sf1", {}, sender)).toMatchObject({ ok: false });
    const erg = await ladeSalesFrankAnrufEin(p, "sf1", { nummer: "0176 555 666" }, sender);
    expect(erg).toMatchObject({ ok: true });
    expect(aufrufe.hwCreate[0]).toMatchObject({ whatsappNummer: "49176555666", optInQuelle: "salesfrank:c9:manuell" });
    expect(aufrufe.anrufUpdate[0]).toMatchObject({ data: { status: "EINGELADEN", handwerkerId: "hw1" } });
  });
  it("Verwerfen entfernt Nummer und Transkript; erledigte Anrufe lassen sich nicht mehr ändern", async () => {
    const { p, aufrufe } = fakePrisma({ anrufe: { sf1: offen, sf2: { ...offen, id: "sf2", status: "EINGELADEN" } } });
    expect(await verwerfeSalesFrankAnruf(p, "sf1")).toEqual({ ok: true });
    expect(aufrufe.anrufUpdate[0]).toMatchObject({ data: { status: "VERWORFEN", nummer: null, transkript: "" } });
    expect(await verwerfeSalesFrankAnruf(p, "sf2")).toMatchObject({ ok: false });
    expect(await ladeSalesFrankAnrufEin(p, "sf2", { nummer: "0176555666" })).toMatchObject({ ok: false });
  });
});
