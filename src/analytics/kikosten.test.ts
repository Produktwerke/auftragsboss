import { describe, it, expect } from "vitest";
import {
  schaetzeAudioSekunden,
  kostenClaudeCent,
  kostenAudioCent,
  summiereKostenCent,
  centZuEuro,
} from "./kikosten.js";

describe("schaetzeAudioSekunden", () => {
  it("~2000 Bytes je Sekunde (Opus 16 kbit/s)", () => {
    expect(schaetzeAudioSekunden(60_000)).toBe(30);
    expect(schaetzeAudioSekunden(2_000)).toBe(1);
  });
  it("mindestens 1 Sekunde bei winzigen Dateien, 0 bei Unsinn", () => {
    expect(schaetzeAudioSekunden(500)).toBe(1);
    expect(schaetzeAudioSekunden(0)).toBe(0);
    expect(schaetzeAudioSekunden(-5)).toBe(0);
    expect(schaetzeAudioSekunden(NaN)).toBe(0);
  });
});

describe("kostenClaudeCent", () => {
  it("rechnet Ein-/Ausgabetoken getrennt", () => {
    // 1M ein (9,20 €) + 1M aus (46,00 €) = 55,20 € = 5520 Cent
    expect(kostenClaudeCent(1_000_000, 1_000_000)).toBe(5520);
  });
  it("rechnet Cache-Token mit: gelesen 0,1×, geschrieben 2× des Eingabepreises", () => {
    // 1M gelesen = 0,92 € = 92 Cent; 1M geschrieben = 18,40 € = 1840 Cent
    expect(kostenClaudeCent(0, 0, { gelesen: 1_000_000, geschrieben: 0 })).toBe(92);
    expect(kostenClaudeCent(0, 0, { gelesen: 0, geschrieben: 1_000_000 })).toBe(1840);
  });
  it("kleine Aufrufe kosten mindestens 1 Cent", () => {
    expect(kostenClaudeCent(100, 10)).toBe(1);
  });
  it("0 Token = 0 Cent", () => {
    expect(kostenClaudeCent(0, 0)).toBe(0);
  });
});

describe("kostenAudioCent", () => {
  it("60 Sekunden ≈ 1,1 Cent → aufgerundet 2", () => {
    expect(kostenAudioCent(60)).toBe(2);
  });
  it("kurze Nachricht mindestens 1 Cent", () => {
    expect(kostenAudioCent(5)).toBe(1);
  });
  it("0 Sekunden = 0 Cent", () => {
    expect(kostenAudioCent(0)).toBe(0);
  });
});

describe("summiereKostenCent", () => {
  it("summiert kostenCent aus dataJson und ignoriert kaputte/fremde Events", () => {
    const events = [
      { dataJson: JSON.stringify({ kostenCent: 12, dienst: "struktur" }) },
      { dataJson: JSON.stringify({ kostenCent: 3 }) },
      { dataJson: JSON.stringify({ kanal: "sprache" }) }, // kein Kosten-Event
      { dataJson: "kein json" },
      { dataJson: JSON.stringify({ kostenCent: "viel" }) },
    ];
    expect(summiereKostenCent(events)).toBe(15);
  });
  it("leer = 0", () => {
    expect(summiereKostenCent([])).toBe(0);
  });
});

describe("centZuEuro", () => {
  it("wandelt für die Anzeige", () => {
    expect(centZuEuro(1680)).toBe(16.8);
    expect(centZuEuro(1)).toBe(0.01);
  });
});
