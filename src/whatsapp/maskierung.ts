// Telefonnummern fürs Log maskieren (Nach-Audit 10.09., S-10): Logs liegen
// 7 Tage auf der Platte; die volle Nummer ist eine Kundendate und gehört nur
// in die Datenbank. Vorwahl und Anfang bleiben lesbar, damit sich ein Fehler
// noch einem Land/Netz zuordnen lässt.
export function maskiereNummer(nummer: string | undefined): string {
  const n = (nummer ?? "").replace(/\D/g, "");
  if (n.length < 6) return n ? "***" : "(leer)";
  return `${n.slice(0, 4)}${"*".repeat(n.length - 6)}${n.slice(-2)}`;
}
