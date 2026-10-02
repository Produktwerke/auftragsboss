import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ERINNERUNG_KURZ_TEXT,
  VIDEO_TEXT_NACHFASSEN,
  VIDEO_TEXT_TELEFON,
  VIDEO_TEXT_WEBSITE,
  VIDEO_URL_STANDARD,
  VIDEO_FEHLERHAFT_BIS,
  faelligFuerVideoNachfassen,
  hatteFehlerhaftesVideo,
  istProbeArt,
  pruefeVideoBytes,
  sendeVideoAnLead,
  sendeVorlagenProbe,
  vergissVideoPruefung,
  videoBereit,
  videoUrl,
} from "./video.js";
import { baueVideoNachricht, baueVorlagenNachricht } from "../whatsapp/send.js";
import { metaFehlerText } from "./status.js";

const block = (typ: string, inhalt: Buffer): Buffer => {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(8 + inhalt.length, 0);
  kopf.write(typ, 4, "latin1");
  return Buffer.concat([kopf, inhalt]);
};
/** Kleine MP4-Attrappe mit echtem Blockaufbau: ftyp, [uuid], moov und mdat in wählbarer Reihenfolge. */
const mp4 = (
  bild: string,
  groesse = 4096,
  aufbau: { uuid?: boolean; moovAmEnde?: boolean; fuellblock?: boolean } = {},
): Uint8Array => {
  const ftyp = block("ftyp", Buffer.from("mp42\0\0\0\0mp41isom", "latin1"));
  const moov = block("moov", Buffer.from(`....${bild}........mp4a....`, "latin1"));
  const zusatz = [...(aufbau.uuid ? [block("uuid", Buffer.alloc(32))] : []), ...(aufbau.fuellblock ? [block("free", Buffer.alloc(8))] : [])];
  const rest = groesse - ftyp.length - moov.length - zusatz.reduce((n, z) => n + z.length, 0) - 8;
  const mdat = block("mdat", Buffer.alloc(Math.max(0, rest)));
  return new Uint8Array(Buffer.concat(aufbau.moovAmEnde ? [ftyp, ...zusatz, mdat, moov] : [ftyp, moov, ...zusatz, mdat]));
};

/** Falsches Netz: eine Videodatei unter einer Adresse, zählt Kopf- und Vollabrufe. */
function falschesNetz(datei: { bytes: Uint8Array; etag: string } | null) {
  const zaehler = { kopf: 0, voll: 0 };
  const stand = { datei };
  const hole = vi.fn(async (_url: unknown, init?: { method?: string }) => {
    const d = stand.datei;
    if (init?.method === "HEAD") {
      zaehler.kopf++;
      if (!d) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "content-length": String(d.bytes.length), etag: d.etag } });
    }
    zaehler.voll++;
    if (!d) return new Response(null, { status: 404 });
    return new Response(Buffer.from(d.bytes), { status: 200 });
  }) as unknown as typeof fetch;
  return { hole, zaehler, stand };
}

describe("Erklärvideo: Einstellung und Dateiprüfung", () => {
  it("Adresse: Standard, abschaltbar, nur https", () => {
    expect(videoUrl({})).toBe(VIDEO_URL_STANDARD);
    expect(videoUrl({ EINLADUNG_VIDEO_URL: "  " })).toBe(VIDEO_URL_STANDARD);
    expect(videoUrl({ EINLADUNG_VIDEO_URL: "aus" })).toBeNull();
    expect(videoUrl({ EINLADUNG_VIDEO_URL: "0" })).toBeNull();
    expect(videoUrl({ EINLADUNG_VIDEO_URL: "https://auftragsboss.de/neu.mp4" })).toBe("https://auftragsboss.de/neu.mp4");
    expect(videoUrl({ EINLADUNG_VIDEO_URL: "http://unsicher.de/x.mp4" })).toBeNull();
  });

  it("H.264 wird angenommen, H.265 abgelehnt (Dirks erste Datei, 29.09.2026), zu groß und Nicht-MP4 ebenso", () => {
    expect(pruefeVideoBytes(mp4("avc1"))).toEqual({ ok: true });
    const hevc = pruefeVideoBytes(mp4("hvc1"));
    expect(hevc.ok).toBe(false);
    expect(hevc.grund).toContain("H.265");
    expect(pruefeVideoBytes(mp4("hev1")).ok).toBe(false);
    expect(pruefeVideoBytes(mp4("vp09")).grund).toContain("H.264");
    expect(pruefeVideoBytes(new Uint8Array(Buffer.from("<html>nicht gefunden</html>"))).grund).toContain("keine MP4");
    expect(pruefeVideoBytes(new Uint8Array(0)).ok).toBe(false);
    expect(pruefeVideoBytes(mp4("avc1", 16 * 1024 * 1024 + 1)).grund).toContain("16 MB");
  });

  it("Aufbau wie von der Windows-Umwandlung (uuid-Block, Inhaltsverzeichnis am Ende) wird abgelehnt (02.10.2026, Video auf dem Handy nicht abspielbar)", () => {
    const windows = pruefeVideoBytes(mp4("avc1", 4096, { uuid: true, moovAmEnde: true }));
    expect(windows.ok).toBe(false);
    expect(windows.grund).toContain("uuid");
    expect(windows.grund).toContain("video-whatsapp-fix");
    expect(pruefeVideoBytes(mp4("avc1", 4096, { moovAmEnde: true })).grund).toContain("Dateiende");
    expect(pruefeVideoBytes(mp4("avc1", 4096, { uuid: true })).ok).toBe(false);
    // So sieht eine umgebaute bzw. mit ffmpeg erzeugte Datei aus: ftyp, moov, (free,) mdat.
    expect(pruefeVideoBytes(mp4("avc1", 4096, { fuellblock: true }))).toEqual({ ok: true });
    // Abgeschnittene Datei: letzter Block reicht über das Dateiende hinaus.
    expect(pruefeVideoBytes(mp4("avc1").subarray(0, 3000)).grund).toContain("keine MP4");
  });

  it("Vorlagentexte: höchstens 1024 Zeichen, keine Gedankenstriche, keine Platzhalter, kein du oder Sie", () => {
    for (const t of [VIDEO_TEXT_TELEFON, VIDEO_TEXT_WEBSITE, VIDEO_TEXT_NACHFASSEN, ERINNERUNG_KURZ_TEXT]) {
      expect(t.length).toBeLessThanOrEqual(1024);
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toContain("{{");
      expect(t).not.toContain("\n\n\n");
      expect(t).not.toContain("unter einer Minute"); // Dirk, 29.09.2026: keine Zeitangabe zum Video
      expect(t).not.toMatch(/\b(du|dir|dich|dein|deine|Sie|Ihnen|Ihr|Ihre)\b/);
      expect(t).toContain("Sprachnachricht");
    }
    expect(VIDEO_TEXT_TELEFON).toContain("Telefonat");
    expect(VIDEO_TEXT_WEBSITE).toContain("auftragsboss.de");
  });
});

describe("Erklärvideo: Erreichbarkeit", () => {
  const url = "https://auftragsboss.de/auftragsboss-video.mp4";
  beforeEach(() => vergissVideoPruefung());

  it("ohne eingeschobenes Netz gibt es in Tests nie ein Video", async () => {
    expect(await videoBereit({ url })).toBeNull();
  });

  it("erreichbar und H.264: Adresse; die Datei wird nur einmal geladen, danach reicht die Kopfabfrage", async () => {
    const { hole, zaehler } = falschesNetz({ bytes: mp4("avc1"), etag: "v1" });
    const t0 = 1_000_000;
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 })).toBe(url);
    expect(zaehler).toEqual({ kopf: 1, voll: 1 });
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 + 5 * 60_000 })).toBe(url); // noch frisch
    expect(zaehler).toEqual({ kopf: 1, voll: 1 });
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 + 11 * 60_000 })).toBe(url); // unverändert
    expect(zaehler).toEqual({ kopf: 2, voll: 1 });
  });

  it("Datei ausgetauscht: wird neu geprüft; H.265 schaltet das Video ab", async () => {
    const { hole, zaehler, stand } = falschesNetz({ bytes: mp4("avc1"), etag: "v1" });
    const t0 = 2_000_000;
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 })).toBe(url);
    stand.datei = { bytes: mp4("hvc1"), etag: "v2" };
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 + 11 * 60_000 })).toBeNull();
    expect(zaehler).toEqual({ kopf: 2, voll: 2 });
  });

  it("nicht hochgeladen (404): kein Video; nach dem Hochladen wird es binnen Minuten erkannt", async () => {
    const { hole, zaehler, stand } = falschesNetz(null);
    const t0 = 3_000_000;
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 })).toBeNull();
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 + 60_000 })).toBeNull(); // Fehlversuch gemerkt
    expect(zaehler.kopf).toBe(1);
    stand.datei = { bytes: mp4("avc1"), etag: "v1" };
    expect(await videoBereit({ url, fetchFn: hole, jetzt: t0 + 3 * 60_000 })).toBe(url);
  });

  it("Netzfehler oder zu große Datei: kein Video, kein Absturz", async () => {
    const kaputt = vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
    expect(await videoBereit({ url, fetchFn: kaputt, jetzt: 1 })).toBeNull();
    vergissVideoPruefung();
    const riesig = vi.fn(async () => new Response(null, { status: 200, headers: { "content-length": String(20 * 1024 * 1024) } })) as unknown as typeof fetch;
    expect(await videoBereit({ url, fetchFn: riesig, jetzt: 1 })).toBeNull();
    expect(riesig).toHaveBeenCalledTimes(1); // nur die Kopfabfrage
  });
});

describe("Erklärvideo: Nachrichtenbauer", () => {
  it("Vorlage mit Video-Kopf: Kopf zuerst, keine Knöpfe", () => {
    const n = baueVorlagenNachricht("49176", "einladung_video", [], [], "https://auftragsboss.de/auftragsboss-video.mp4");
    expect(n.template.components).toEqual([
      { type: "header", parameters: [{ type: "video", video: { link: "https://auftragsboss.de/auftragsboss-video.mp4" } }] },
    ]);
  });

  it("Video als normale Nachricht mit Bildunterschrift", () => {
    expect(baueVideoNachricht("49176", "https://x.de/v.mp4", "So geht's")).toEqual({
      messaging_product: "whatsapp",
      to: "49176",
      type: "video",
      video: { link: "https://x.de/v.mp4", caption: "So geht's" },
    });
    expect(baueVideoNachricht("49176", "https://x.de/v.mp4").video).toEqual({ link: "https://x.de/v.mp4" });
  });

  it("Meta-Fehler beim Laden des Videos ist auf Deutsch erklärt", () => {
    expect(metaFehlerText(131053, "Media upload error")).toContain("nicht laden");
  });
});

describe("Erklärvideo: einmalig nachschicken", () => {
  const lead = { leadQuelle: "TELEFON", onboardingStatus: "GELESEN", blockiert: false };
  const einladung = { typ: "LEAD_EINLADUNG_GESENDET", dataJson: "{}" };

  it("fällig: Einladung gelesen (oder Knopf gedrückt), nichts eingesprochen, Video noch nicht bekommen", () => {
    expect(faelligFuerVideoNachfassen(lead, [einladung])).toBe(true);
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "ERKLAERT" }, [einladung])).toBe(true);
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "WARTET_AUF_AUFTRAG" }, [einladung])).toBe(true);
  });

  it("nicht fällig: nur zugestellt, aktiv, abbestellt, blockiert, kein Lead, nie eingeladen, Video schon bekommen", () => {
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "ZUGESTELLT" }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "EINGELADEN" }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "AKTIV" }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "MARKETING_ABBESTELLT" }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen({ ...lead, blockiert: true }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen({ ...lead, leadQuelle: null }, [einladung])).toBe(false);
    expect(faelligFuerVideoNachfassen(lead, [])).toBe(false);
    expect(faelligFuerVideoNachfassen(lead, [{ typ: "LEAD_EINLADUNG_GESENDET", dataJson: '{"vorlage":"einladung_video","video":true}' }])).toBe(false);
    expect(faelligFuerVideoNachfassen(lead, [einladung, { typ: "LEAD_VIDEO_GESENDET", dataJson: '{"art":"nachfassen"}' }])).toBe(false);
  });

  it("nicht fällig: Marketing abbestellt (Meta 131050), auch wenn der Zustand noch GELESEN ist (Fabian, 01.10.2026)", () => {
    const abbestellt = { typ: "NACHRICHT_FEHLGESCHLAGEN", dataJson: '{"code":131050,"zustand":"GELESEN"}' };
    expect(faelligFuerVideoNachfassen(lead, [einladung, abbestellt])).toBe(false);
    expect(faelligFuerVideoNachfassen(lead, [einladung, { typ: "LEAD_MARKETING_ABBESTELLT", dataJson: "{}" }])).toBe(false);
    // Ein anderer Fehlschlag (131047, Antwort hing fest) sperrt nicht: genau diese Leads sollen das Video bekommen.
    expect(faelligFuerVideoNachfassen(lead, [einladung, { typ: "NACHRICHT_FEHLGESCHLAGEN", dataJson: '{"code":131047}' }])).toBe(true);
    expect(faelligFuerVideoNachfassen(lead, [einladung, { typ: "NACHRICHT_FEHLGESCHLAGEN", dataJson: "kaputt" }])).toBe(true);
  });

  it("nicht abspielbare Fassung vom 02.10.2026: wer nur sie bekam, ist einmal erneut fällig; nach dem neuen Versand nicht mehr", () => {
    const fehlerhaft = { typ: "LEAD_VIDEO_GESENDET", dataJson: '{"art":"nachfassen"}', erstelltAm: new Date("2026-10-02T11:47:05Z") };
    const funktionierend = { typ: "LEAD_VIDEO_GESENDET", dataJson: '{"art":"nachfassen"}', erstelltAm: new Date("2026-10-02T12:45:00Z") };
    expect(faelligFuerVideoNachfassen(lead, [einladung, fehlerhaft])).toBe(true);
    expect(hatteFehlerhaftesVideo([einladung, fehlerhaft])).toBe(true);
    expect(faelligFuerVideoNachfassen(lead, [einladung, fehlerhaft, funktionierend])).toBe(false);
    expect(hatteFehlerhaftesVideo([einladung, fehlerhaft, funktionierend])).toBe(false);
    expect(hatteFehlerhaftesVideo([einladung])).toBe(false);
    expect(VIDEO_FEHLERHAFT_BIS.toISOString()).toBe("2026-10-02T12:30:00.000Z");
    // Wer inzwischen aktiv ist oder Marketing abbestellt hat, bekommt auch die Wiederholung nicht.
    expect(faelligFuerVideoNachfassen({ ...lead, onboardingStatus: "AKTIV" }, [einladung, fehlerhaft])).toBe(false);
    expect(faelligFuerVideoNachfassen(lead, [einladung, fehlerhaft, { typ: "NACHRICHT_FEHLGESCHLAGEN", dataJson: '{"code":131050}' }])).toBe(false);
  });

  function fakePrisma() {
    const aufrufe: { events: unknown[]; adminLog: Array<{ aktion: string; detail: string }> } = { events: [], adminLog: [] };
    const p = {
      event: { create: vi.fn(async (a: unknown) => { aufrufe.events.push(a); return {}; }) },
      adminLog: { create: vi.fn(async (a: { data: { aktion: string; detail: string } }) => { aufrufe.adminLog.push(a.data); return {}; }) },
    };
    return { p: p as unknown as PrismaClient, aufrufe };
  }
  const kandidat = { id: "hw1", whatsappNummer: "4917612345678", firma: "Maler Test", name: "", onboardingStatus: "GELESEN" };
  const video = async () => "https://auftragsboss.de/auftragsboss-video.mp4";

  it("sendet die Vorlage video_nachfassen mit Video-Kopf und protokolliert", async () => {
    const { p, aufrufe } = fakePrisma();
    const sende = vi.fn(async () => true);
    expect(await sendeVideoAnLead(p, kandidat, "Test", { sende: sende as never, video })).toEqual({ ok: true });
    expect(sende).toHaveBeenCalledWith("4917612345678", "video_nachfassen", [], [], "https://auftragsboss.de/auftragsboss-video.mp4");
    expect(aufrufe.events).toHaveLength(1);
    expect(aufrufe.adminLog[0]?.aktion).toBe("LEAD_VIDEO_GESENDET");
  });

  it("Meta lehnt ab: Fehlschlag im Protokoll, kein Ereignis (späterer Versuch bleibt möglich)", async () => {
    const { p, aufrufe } = fakePrisma();
    const erg = await sendeVideoAnLead(p, kandidat, "Test", { sende: vi.fn(async () => false) as never, video });
    expect(erg.ok).toBe(false);
    expect(aufrufe.events).toHaveLength(0);
    expect(aufrufe.adminLog[0]?.aktion).toBe("LEAD_VIDEO_FEHLGESCHLAGEN");
  });

  it("Probe an das Betreiber-Handy: Video-Vorlagen mit Video-Kopf, Erinnerung ohne; nur Admin-Protokoll", async () => {
    const { p, aufrufe } = fakePrisma();
    const sende = vi.fn(async () => true);
    expect(await sendeVorlagenProbe(p, "einladung_telefon", "4917600000000", { sende: sende as never, video })).toEqual({ ok: true, vorlage: "einladung_video" });
    expect(sende).toHaveBeenLastCalledWith("4917600000000", "einladung_video", [], [], "https://auftragsboss.de/auftragsboss-video.mp4");
    await sendeVorlagenProbe(p, "einladung_website", "4917600000000", { sende: sende as never, video });
    expect(sende).toHaveBeenLastCalledWith("4917600000000", "test_starten_video", [], [], "https://auftragsboss.de/auftragsboss-video.mp4");
    await sendeVorlagenProbe(p, "erinnerung", "4917600000000", { sende: sende as never, video: async () => null });
    expect(sende).toHaveBeenLastCalledWith("4917600000000", "lead_erinnerung_kurz", [], [], undefined);
    expect(aufrufe.events).toHaveLength(0); // eine Probe ist kein Lead-Ereignis
    expect(aufrufe.adminLog.map((a) => a.aktion)).toEqual(["VORLAGE_PROBE", "VORLAGE_PROBE", "VORLAGE_PROBE"]);
  });

  it("Probe: ohne Betreiber-Nummer, ohne Video oder bei Ablehnung durch Meta kommt eine klare Meldung", async () => {
    const { p, aufrufe } = fakePrisma();
    const sende = vi.fn(async () => true);
    const ohneNummer = await sendeVorlagenProbe(p, "nachfassen", null, { sende: sende as never, video });
    expect(ohneNummer.ok === false && ohneNummer.fehler).toContain("Betreiber-Nummer");
    const ohneVideo = await sendeVorlagenProbe(p, "nachfassen", "4917600000000", { sende: sende as never, video: async () => null });
    expect(ohneVideo.ok === false && ohneVideo.fehler).toContain("Erklärvideo");
    expect(sende).not.toHaveBeenCalled();
    const abgelehnt = await sendeVorlagenProbe(p, "nachfassen", "4917600000000", { sende: vi.fn(async () => false) as never, video });
    expect(abgelehnt.ok === false && abgelehnt.fehler).toContain("video_nachfassen");
    expect(aufrufe.adminLog.at(-1)?.aktion).toBe("VORLAGE_PROBE_FEHLGESCHLAGEN");
    expect(istProbeArt("nachfassen")).toBe(true);
    expect(istProbeArt("irgendwas")).toBe(false);
  });

  it("kein Versand ohne erreichbares Video und nicht an Betriebe, die Marketing abbestellt haben", async () => {
    const { p, aufrufe } = fakePrisma();
    const sende = vi.fn(async () => true);
    const ohne = await sendeVideoAnLead(p, kandidat, "Test", { sende: sende as never, video: async () => null });
    expect(ohne.ok).toBe(false);
    const abbestellt = await sendeVideoAnLead(p, { ...kandidat, onboardingStatus: "MARKETING_ABBESTELLT" }, "Test", { sende: sende as never, video });
    expect(abbestellt.ok === false && abbestellt.fehler).toContain("abbestellt");
    expect(sende).not.toHaveBeenCalled();
    expect(aufrufe.adminLog).toHaveLength(0);
  });
});
