import { describe, it, expect, vi } from "vitest";
import {
  KNOPF_AUSPROBIEREN,
  KNOPF_ERKLAEREN,
  KNOPF_JA,
  legeLeadAnUndLadeEin,
  markiereLeadAktiv,
  verarbeiteOnboardingKnopf,
  type LeadSender,
} from "./onboarding.js";
import { extrahiereEingabe } from "../whatsapp/webhook.js";
import { baueVorlagenNachricht, baueKnopfNachricht } from "../whatsapp/send.js";
import type { Handwerker, PrismaClient } from "@prisma/client";

function fakePrisma(vorgaben: { vorhanden?: unknown } = {}) {
  const aufrufe: Record<string, unknown[]> = { create: [], update: [], updateMany: [], events: [] };
  const p = {
    handwerker: {
      findUnique: vi.fn(async () => vorgaben.vorhanden ?? null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        aufrufe.create.push(a);
        return { id: "hw1", ...a.data };
      }),
      update: vi.fn(async (a: unknown) => { aufrufe.update.push(a); return {}; }),
      updateMany: vi.fn(async (a: unknown) => { aufrufe.updateMany.push(a); return { count: 1 }; }),
    },
    event: { create: vi.fn(async (a: unknown) => { aufrufe.events.push(a); return {}; }) },
  };
  return { p: p as unknown as PrismaClient, aufrufe };
}

function fakeSender() {
  const gesendet: Array<{ art: string; args: unknown[] }> = [];
  const sender: LeadSender = {
    vorlage: vi.fn(async (...args: unknown[]) => { gesendet.push({ art: "vorlage", args }); return true; }) as never,
    text: vi.fn(async (...args: unknown[]) => { gesendet.push({ art: "text", args }); }) as never,
    knoepfe: vi.fn(async (...args: unknown[]) => { gesendet.push({ art: "knoepfe", args }); return true; }) as never,
  };
  return { sender, gesendet };
}

const lead = (status: string | null): Handwerker =>
  ({ id: "hw1", whatsappNummer: "4917612345678", onboardingStatus: status }) as Handwerker;

describe("Lead-Onboarding: anlegen + einladen", () => {
  it("normalisiert die Nummer, legt ein Test-Konto mit Opt-in an und sendet die Vorlage mit zwei Knöpfen", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    const erg = await legeLeadAnUndLadeEin(p, { nummer: "0176 1234567", anrede: "Herr Müller", firma: "Maler Müller" }, sender);
    expect("handwerker" in erg).toBe(true);
    const daten = (aufrufe.create[0] as { data: Record<string, unknown> }).data;
    expect(daten.whatsappNummer).toBe("491761234567");
    expect(daten.istTest).toBe(true);
    expect(daten.leadQuelle).toBe("TELEFON");
    expect(daten.optInQuelle).toBe("telefonat");
    expect(daten.onboardingStatus).toBe("EINGELADEN");
    const vorlage = gesendet.find((g) => g.art === "vorlage");
    expect(vorlage?.args[2]).toEqual(["Herr Müller"]); // {{1}} = Anrede
    expect(vorlage?.args[3]).toEqual([KNOPF_JA, KNOPF_ERKLAEREN]);
  });

  it("lehnt unbrauchbare Nummer und vorhandene Nummer ab", async () => {
    const { p } = fakePrisma();
    const { sender } = fakeSender();
    const kaputt = await legeLeadAnUndLadeEin(p, { nummer: "abc", anrede: "Herr X" }, sender);
    expect("fehler" in kaputt).toBe(true);

    const { p: p2 } = fakePrisma({ vorhanden: { firma: "Bestand GmbH", name: "" } });
    const doppelt = await legeLeadAnUndLadeEin(p2, { nummer: "01761234567", anrede: "Herr X" }, sender);
    expect("fehler" in doppelt && doppelt.fehler).toContain("Bestand GmbH");
  });

  it("Vorlagen-Versand schlägt fehl → Lead bleibt angelegt, Fehler fürs UI", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender } = fakeSender();
    (sender.vorlage as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const erg = await legeLeadAnUndLadeEin(p, { nummer: "01761234567", anrede: "Herr X" }, sender);
    expect("fehler" in erg && erg.fehler).toContain("nicht gesendet");
    expect(aufrufe.create).toHaveLength(1); // Opt-in dokumentiert
  });
});

describe("Lead-Onboarding: Knopf-Klicks", () => {
  it("Klick auf Ja → genau EINE Aufforderung, Status WARTET_AUF_AUFTRAG", async () => {
    const { p, aufrufe } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    await verarbeiteOnboardingKnopf(p, lead("EINGELADEN"), KNOPF_JA, sender);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].art).toBe("text");
    expect(String(gesendet[0].args[1])).toContain("Sprachnachricht");
    expect((aufrufe.update[0] as { data: Record<string, unknown> }).data.onboardingStatus).toBe("WARTET_AUF_AUFTRAG");
  });

  it("doppelter Klick/Webhook → keine zweite Aufforderung (idempotent)", async () => {
    const { p } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    await verarbeiteOnboardingKnopf(p, lead("WARTET_AUF_AUFTRAG"), KNOPF_JA, sender);
    expect(gesendet).toHaveLength(0);
  });

  it("Klick auf Kurz erklären → kurze Erklärung mit Ausprobieren-Knopf", async () => {
    const { p } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    await verarbeiteOnboardingKnopf(p, lead("EINGELADEN"), KNOPF_ERKLAEREN, sender);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].art).toBe("knoepfe");
    expect(String(gesendet[0].args[1])).toContain("Preise musst du nicht diktieren");
    expect(gesendet[0].args[2]).toEqual([{ id: KNOPF_AUSPROBIEREN, titel: "Angebot ausprobieren" }]);
  });

  it("unbekannte Kennung → still ignorieren", async () => {
    const { p } = fakePrisma();
    const { sender, gesendet } = fakeSender();
    await verarbeiteOnboardingKnopf(p, lead("EINGELADEN"), "FREMD", sender);
    expect(gesendet).toHaveLength(0);
  });
});

describe("Lead-Onboarding: erste echte Eingabe", () => {
  it("markiert den Lead als AKTIV (auch ohne Knopfdruck), aber nur einmal", async () => {
    const { p, aufrufe } = fakePrisma();
    expect(await markiereLeadAktiv(p, lead("EINGELADEN"))).toBe(true);
    expect((aufrufe.updateMany[0] as { data: Record<string, unknown> }).data.onboardingStatus).toBe("AKTIV");
    expect(await markiereLeadAktiv(p, lead("AKTIV"))).toBe(false);
    expect(await markiereLeadAktiv(p, lead(null))).toBe(false); // normaler Nutzer: nichts tun
  });
});

describe("Webhook: Knopf-Klicks erkennen", () => {
  it("Vorlagen-Schnellantwort und interaktiver Knopf liefern knopfPayload", () => {
    expect(extrahiereEingabe({ from: "49176", id: "m1", type: "button", button: { payload: KNOPF_JA, text: "Ja" } }))
      .toEqual({ vonNummer: "49176", knopfPayload: KNOPF_JA });
    expect(
      extrahiereEingabe({
        from: "49176", id: "m2", type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: KNOPF_AUSPROBIEREN, title: "Angebot ausprobieren" } },
      }),
    ).toEqual({ vonNummer: "49176", knopfPayload: KNOPF_AUSPROBIEREN });
    expect(extrahiereEingabe({ from: "49176", id: "m3", type: "sticker" })).toBeNull();
  });
});

describe("WhatsApp-Nachrichtenbauer", () => {
  it("Vorlage mit Schnellantwort-Knöpfen: Payloads als button-components", () => {
    const n = baueVorlagenNachricht("49176", "angebot_ausprobieren", ["Herr Müller"], [KNOPF_JA, KNOPF_ERKLAEREN]);
    expect(n.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Herr Müller" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: KNOPF_JA }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: KNOPF_ERKLAEREN }] },
    ]);
  });

  it("interaktive Knopf-Nachricht im Meta-Format", () => {
    const n = baueKnopfNachricht("49176", "Hallo", [{ id: "X", titel: "Los" }]);
    expect(n.interactive).toEqual({
      type: "button",
      body: { text: "Hallo" },
      action: { buttons: [{ type: "reply", reply: { id: "X", title: "Los" } }] },
    });
  });
});
