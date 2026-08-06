import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ladeWissen, positionJeId } from "./wissen.js";
import { pruefeScope } from "./scope.js";

function ladeJson(datei: string): { faelle: Array<Record<string, unknown>> } {
  return JSON.parse(readFileSync(resolve("knowledge", "maler", datei), "utf-8"));
}

describe("Maler-Wissensbasis: lädt und validiert", () => {
  const w = ladeWissen();

  it("Ontologie deckt den v0-Mindestumfang ab", () => {
    expect(w.ontologie.objektarten.length).toBeGreaterThanOrEqual(8);
    expect(w.ontologie.bauteile.length).toBeGreaterThanOrEqual(15);
    expect(w.ontologie.untergruende.length).toBeGreaterThanOrEqual(12);
    expect(w.ontologie.zustaende.length).toBeGreaterThanOrEqual(13);
    expect(w.ontologie.leistungen.length).toBeGreaterThanOrEqual(20);
    expect(w.ontologie.parameter.length).toBeGreaterThanOrEqual(15);
  });

  it("mindestens 25 Positionstypen, ohne doppelte IDs", () => {
    expect(w.positionen.length).toBeGreaterThanOrEqual(25);
    const ids = w.positionen.map((p) => p.position_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("jede Position hat Titel, Einheit und nur zulässige Preisquellen", () => {
    const erlaubt = new Set([
      "explicit_current_input",
      "confirmed_private_business_profile",
      "confirmed_private_historical_offer",
      "manual_current_editor_input",
    ]);
    for (const p of w.positionen) {
      expect(p.titel.trim().length).toBeGreaterThan(0);
      expect(p.einheiten.length).toBeGreaterThan(0);
      for (const q of p.preisquellen) expect(erlaubt.has(q)).toBe(true);
    }
  });

  it("Schnellzugriff je id funktioniert", () => {
    expect(positionJeId("wand_beschichten")?.titel).toBe("Wandflächen beschichten");
    expect(positionJeId("boden_schuetzen")?.vorschlag_wenn).toContain("moeblierungszustand:moebliert");
  });

  it("lädt Rückfrageregeln (A/B/C), Validierungsregeln und Auftragstypen", () => {
    expect(w.fragen.length).toBeGreaterThanOrEqual(20);
    expect(w.validierungsregeln.length).toBeGreaterThanOrEqual(10);
    expect(w.auftragstypen.length).toBeGreaterThanOrEqual(10);
    for (const f of w.fragen) expect(["A", "B", "C"]).toContain(f.prioritaet);
    const qids = w.fragen.map((f) => f.question_id);
    expect(new Set(qids).size).toBe(qids.length);
  });
});

describe("Scope-Erkennung", () => {
  it("erkennt Innenrenovierung als sicheren v0-Scope", () => {
    const r = pruefeScope("Wohnzimmer 45 Quadratmeter Wände weiß streichen, Raufaser bleibt");
    expect(r.status).toBe("inside_v0");
  });
  it("markiert WDVS/Fassadendämmung als außerhalb v0", () => {
    const r = pruefeScope("Wir sollen die Fassade dämmen, WDVS mit 14 cm");
    expect(r.status).toBe("outside_v0");
    expect(r.requiresManualReview).toBe(true);
    expect(r.treffer.length).toBeGreaterThan(0);
  });
  it("stuft Schimmel als eingeschränkt ein (Vorsicht statt Bewertung)", () => {
    const r = pruefeScope("An der Wand ist Schimmel, soll gestrichen werden");
    expect(r.status).toBe("eingeschraenkt");
  });
});

describe("Goldstandard-Fixtures: Integrität gegen die Wissensbasis", () => {
  const w = ladeWissen();
  const positionIds = new Set(w.positionen.map((p) => p.position_id));
  const questionIds = new Set(w.fragen.map((f) => f.question_id));
  const ruleIds = new Set(w.validierungsregeln.map((r) => r.rule_id));
  const tc = ladeJson("test_cases.json").faelle;
  const nc = ladeJson("negative_cases.json").faelle;

  it("enthält genug Fälle (>=25 Gold, >=15 Negativ) und >=50 Sprachmuster", () => {
    expect(tc.length).toBeGreaterThanOrEqual(25);
    expect(nc.length).toBeGreaterThanOrEqual(15);
    expect(w.sprachmuster.length).toBeGreaterThanOrEqual(50);
  });

  it("Testfälle verweisen nur auf existierende Positionen und Rückfragen", () => {
    for (const f of tc) {
      for (const p of (f.positionsvorschlaege as string[] | undefined) ?? []) {
        expect(positionIds.has(p), `unbekannte position ${p} in ${f.id}`).toBe(true);
      }
      for (const q of (f.pflicht_rueckfragen as string[] | undefined) ?? []) {
        expect(questionIds.has(q), `unbekannte rueckfrage ${q} in ${f.id}`).toBe(true);
      }
    }
  });

  it("Negativfälle verweisen nur auf existierende Schutzregeln", () => {
    for (const f of nc) {
      expect(ruleIds.has(f.schutzregel as string), `unbekannte schutzregel in ${f.id}`).toBe(true);
    }
  });
});
