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
