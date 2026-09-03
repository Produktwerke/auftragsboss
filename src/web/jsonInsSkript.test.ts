import { describe, it, expect } from "vitest";
import { jsonInsSkript } from "./jsonInsSkript.js";

describe("jsonInsSkript: sichere JSON-Einbettung in <script>", () => {
  it("lässt die Zeichenfolge </script> nie roh im Quelltext stehen", () => {
    const raus = jsonInsSkript({ kundeName: "</script><img src=x onerror=alert(1)>" });
    expect(raus).not.toContain("</script>");
    expect(raus).not.toContain("<");
    expect(raus).not.toContain(">");
    expect(raus).not.toContain("&");
  });

  it("der Wert bleibt nach JSON.parse exakt erhalten (Roundtrip)", () => {
    const original = {
      text: "</script> & <b>fett</b>",
      zeilentrenner: "a b c",
      umlaute: "Größenänderung äöüß",
      zahl: 12.5,
      leer: null,
    };
    expect(JSON.parse(jsonInsSkript(original))).toEqual(original);
  });

  it("undefined wird zu null statt zu ungültigem Quelltext", () => {
    expect(jsonInsSkript(undefined)).toBe("null");
  });

  it("einfache Tokens bleiben unverändert lesbar", () => {
    expect(jsonInsSkript("k7m3rq9x2p8h")).toBe('"k7m3rq9x2p8h"');
  });
});
