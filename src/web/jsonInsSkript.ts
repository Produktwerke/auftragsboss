// Bettet einen Wert sicher als JSON in einen <script>-Block ein.
//
// JSON.stringify allein reicht dafür NICHT: Steht im Wert irgendwo die
// Zeichenfolge "</script>", beendet der HTML-Parser das Script-Element,
// BEVOR der JavaScript-Parser den String überhaupt sieht — der Rest der
// Nutzereingabe würde als HTML/Skript ausgeführt (Stored XSS).
//
// Deshalb werden <, > und & als \u00XX-Escapes geschrieben. Das ist
// weiterhin gültiges JSON mit exakt demselben Wert nach dem Parsen —
// nur die HTML-gefährlichen Rohzeichen kommen nie im Quelltext vor.
// U+2028/U+2029 sind in älterem JS-Quelltext Zeilentrenner und werden
// ebenfalls escaped (sonst Syntaxfehler bei exotischen Eingaben).
export function jsonInsSkript(wert: unknown): string {
  const json = JSON.stringify(wert);
  if (json === undefined) return "null";
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
