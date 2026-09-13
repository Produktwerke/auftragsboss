import { describe, it, expect } from "vitest";
import { baueFertigmeldung, kurzeBilanz, MAX_ZEICHEN, MAX_HINWEISE, FOTO_TIPP } from "./fertigmeldung.js";

const basis = {
  bezeichnung: "Angebot" as const,
  nummer: "ANG-2026-0007",
  version: 1,
  kunde: "Familie Müller",
  link: "https://api.auftragsboss.de/k7m3rq9x2p8h",
  raeume: ["Kinderzimmer links", "Dachzimmer"],
  leistungen: ["Wände streichen", "Decke streichen", "Schutz- und Abdeckarbeiten"],
  anzahlPositionen: 5,
  gesamtBrutto: null,
  hinweise: [],
  fehlende: [],
  fotoTipp: false,
  istTest: false,
  gewaehrleistungJahre: null,
  mitKnoepfen: true,
};

describe("kurzeBilanz", () => {
  it("sammelt Räume in Reihenfolge und Leistungen ohne Material und ohne inkl.-Material-Zusatz", () => {
    const b = kurzeBilanz([
      { kategorie: "LEISTUNG", beschreibung: "Wände streichen, inkl. Material", raumBezug: "Kinderzimmer links" },
      { kategorie: "MATERIAL", beschreibung: "Farbe", raumBezug: "Kinderzimmer links" },
      { kategorie: "LEISTUNG", beschreibung: "Wände streichen, inkl. Material", raumBezug: "Dachzimmer" },
      { kategorie: "LEISTUNG", beschreibung: "Schutz- und Abdeckarbeiten\nMöbel und Boden", raumBezug: null },
    ]);
    expect(b.raeume).toEqual(["Kinderzimmer links", "Dachzimmer"]);
    expect(b.leistungen).toEqual(["Wände streichen", "Schutz- und Abdeckarbeiten"]);
  });
});

describe("baueFertigmeldung", () => {
  it("ist kompakt: Kopf, Verstanden-Zeile, Link, keine Material- oder Einstellungszeilen", () => {
    const t = baueFertigmeldung(basis);
    expect(t.split("\n")[0]).toBe("✅ Angebot ANG-2026-0007 für *Familie Müller* ist fertig");
    expect(t).toContain("📋 Kinderzimmer links, Dachzimmer: Wände streichen, Decke streichen, Schutz- und Abdeckarbeiten (5 Positionen)");
    expect(t).toContain("👉 https://api.auftragsboss.de/k7m3rq9x2p8h");
    expect(t).not.toMatch(/Materialposten|Betriebsdaten|durchsagen|an den Kunden schicken/);
    expect(t).not.toContain("—");
  });

  it("nennt bei einer weiteren Fassung die Fassungsnummer statt des Kunden", () => {
    const t = baueFertigmeldung({ ...basis, version: 3 });
    expect(t.split("\n")[0]).toBe("✅ Angebot ANG-2026-0007, Fassung 3");
  });

  it("zeigt Warnhinweise, offene Pflichtangaben, Fototipp und Testhinweis", () => {
    const t = baueFertigmeldung({
      ...basis,
      hinweise: [
        "⚠️ Kinderzimmer links: Fenster 1,70 x 3,10: höher als der Raum, nicht abgezogen. Bitte Maß prüfen.",
        "ℹ️ Wand 2 (Dachzimmer): Boden nicht im Bild, Maße ungenauer.",
      ],
      fehlende: ["Kundenadresse"],
      fotoTipp: true,
      istTest: true,
      gesamtBrutto: "1.234,00 €",
    });
    expect(t).toContain("💶 Gesamt: 1.234,00 € brutto");
    expect(t).toContain("⚠️ Kinderzimmer links: Fenster");
    expect(t).toContain("ℹ️ Wand 2 (Dachzimmer)");
    expect(t).toContain("✏️ Im Angebot noch ergänzen: Kundenadresse.");
    expect(t).toContain(FOTO_TIPP);
    expect(t).toContain("👆 Das war ein Test.");
    // Mit Knöpfen kein Text-Hinweis zum Weitermachen
    expect(t).not.toContain("Einfach weiter diktieren");
  });

  it("ergänzt ohne Knöpfe den Hinweis zum Weitermachen und kürzt mehr als vier Hinweise", () => {
    const viele = Array.from({ length: 7 }, (_, i) => `⚠️ Hinweis ${i + 1}`);
    const t = baueFertigmeldung({ ...basis, hinweise: viele, mitKnoepfen: false });
    expect(t).toContain("Einfach weiter diktieren");
    expect(t.match(/⚠️ Hinweis/g)?.length).toBe(MAX_HINWEISE);
    expect(t).toContain("… und 3 weitere Hinweise");
  });

  it("bleibt unter der WhatsApp-Grenze für Knopfnachrichten", () => {
    const lang = Array.from({ length: 4 }, (_, i) => `⚠️ ${"x".repeat(300)} ${i}`);
    const t = baueFertigmeldung({ ...basis, hinweise: lang, leistungen: Array.from({ length: 8 }, (_, i) => `Leistung ${i}`) });
    expect(t.length).toBeLessThanOrEqual(MAX_ZEICHEN);
    expect(t).toContain("👉 https://api.auftragsboss.de/k7m3rq9x2p8h");
    expect(t).toContain("+5 weitere");
  });
});
