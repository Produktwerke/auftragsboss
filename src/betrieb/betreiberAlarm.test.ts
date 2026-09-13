import { describe, it, expect } from "vitest";
import { neuerKundeParameter } from "./betreiberAlarm.js";
import { normalisiereHandy } from "../config.js";
import { baueVorlagenNachricht } from "../whatsapp/send.js";

describe("Betreiber-Benachrichtigung: Handynummer aus der .env", () => {
  it("wandelt die deutsche 0-Vorwahl in 49 um und wirft Trennzeichen raus", () => {
    expect(normalisiereHandy("017662492471")).toBe("4917662492471");
    expect(normalisiereHandy("0176 6249 2471")).toBe("4917662492471");
    expect(normalisiereHandy("+49 176 62492471")).toBe("4917662492471");
    expect(normalisiereHandy("4917662492471")).toBe("4917662492471");
  });

  it("Leeres/Unbrauchbares ergibt null (Funktion aus, kein Absturz)", () => {
    expect(normalisiereHandy(undefined)).toBeNull();
    expect(normalisiereHandy("")).toBeNull();
    expect(normalisiereHandy("abc")).toBeNull();
    expect(normalisiereHandy("123")).toBeNull(); // zu kurz
  });
});

describe("Betreiber-Benachrichtigung: Vorlagen-Inhalt", () => {
  it("füllt Firma und Abo-Beschreibung mit deutschem Preisformat", () => {
    expect(neuerKundeParameter("Malerbetrieb Müller GmbH", "Basis", 49)).toEqual([
      "Malerbetrieb Müller GmbH",
      "Basis (49 € im Monat)",
    ]);
    expect(neuerKundeParameter("  ", "Profi", 99.5)).toEqual([
      "Ein Betrieb",
      "Profi (99,5 € im Monat)",
    ]);
  });

  it("baut den Vorlagen-Nachrichtenkörper im Meta-Format", () => {
    const n = baueVorlagenNachricht("4917662492471", "neuer_kunde", ["Firma X", "Basis (49 € im Monat)"]);
    expect(n).toEqual({
      messaging_product: "whatsapp",
      to: "4917662492471",
      type: "template",
      template: {
        name: "neuer_kunde",
        language: { code: "de" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Firma X" },
              { type: "text", text: "Basis (49 € im Monat)" },
            ],
          },
        ],
      },
    });
    // Vorlage ohne Platzhalter → keine components
    expect(baueVorlagenNachricht("49123456789", "x", []).template.components).toEqual([]);
  });
});

describe("Störungsalarm (13.09.2026)", () => {
  it("meldet je Schlüssel höchstens einmal pro Stunde", async () => {
    const { darfMelden, alarmZuruecksetzen, ALARM_ABSTAND_MS } = await import("./betreiberAlarm.js");
    alarmZuruecksetzen();
    expect(darfMelden("a", 1_000)).toBe(true);
    expect(darfMelden("a", 1_000 + ALARM_ABSTAND_MS - 1)).toBe(false);
    expect(darfMelden("b", 2_000)).toBe(true);
    expect(darfMelden("a", 1_000 + ALARM_ABSTAND_MS)).toBe(true);
  });

  it("macht aus Was und Stand saubere Vorlagen-Platzhalter ohne Zeilenumbruch", async () => {
    const { alarmParameter } = await import("./betreiberAlarm.js");
    expect(alarmParameter("Angebot konnte nicht\nerstellt werden   (Firma)", "")).toEqual(["Angebot konnte nicht erstellt werden (Firma)", "-"]);
    expect(alarmParameter("x".repeat(400), "ok")[0]!.length).toBe(300);
  });

  it("baut die Alarm-Mail mit Kundensatz und die Entwarnung ohne", async () => {
    const { alarmMailHtml } = await import("./betreiberAlarm.js");
    const s = { schluessel: "auswertung:1", was: "Angebot konnte nicht erstellt werden (Firma)", stand: "Versuch 1 von 6", details: "Error <x>", kundenSatz: "Hallo Kunde" };
    const alarm = alarmMailHtml(s, false);
    expect(alarm).toContain("⚠️ Störung");
    expect(alarm).toContain("Error &lt;x&gt;");
    expect(alarm).toContain("Hallo Kunde");
    const ok = alarmMailHtml(s, true);
    expect(ok).toContain("✅ Entwarnung");
    expect(ok).not.toContain("Hallo Kunde");
  });
});
