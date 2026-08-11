// PLZ-Nachschlag über die OpenPLZ API (openplzapi.org) — kostenlos, ohne
// Anmeldung, Daten aus Deutschland/EU. Wir senden NUR Straße + Ort (keinen
// Kundennamen) und bekommen die Postleitzahl zurück. Bewusst serverseitig,
// damit die Adresse nicht direkt aus dem Browser an einen Dritten geht.
//
// Fehlertolerant: Bei jedem Problem (Dienst weg, Timeout, kein Treffer) kommt
// null zurück — der Editor bleibt normal bedienbar, der Nutzer tippt die PLZ
// dann selbst.
const BASIS = "https://openplzapi.org/de/Streets";

interface OpenPlzStrasse {
  postalCode?: string;
  locality?: string;
}

/** Eine OpenPLZ-Abfrage; gibt die Trefferliste oder null (Fehler/Timeout). */
async function abfrage(url: string): Promise<OpenPlzStrasse[] | null> {
  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const daten = (await r.json()) as OpenPlzStrasse[];
    return Array.isArray(daten) ? daten : null;
  } catch {
    return null;
  } finally {
    clearTimeout(stop);
  }
}

/** Sucht die PLZ zu einer Straße in einem Ort. Gibt die 5-stellige PLZ oder null. */
export async function findePlz(strasse: string, ort: string): Promise<string | null> {
  // Hausnummer entfernen ("Musterstraße 5a" -> "Musterstraße") und die Endung
  // "straße"/"strasse" zu "str" abkürzen: OpenPLZ speichert Straßen abgekürzt
  // ("Hauptstr.") und matcht den name-Parameter als PRÄFIX — "Hauptstraße"
  // träfe sonst nichts, "Hauptstr" schon.
  const street = (strasse ?? "")
    .replace(/\s+\d+\s*[a-zA-Z]?$/, "")
    .replace(/stra(ß|ss)e\.?$/i, "Str")
    .trim();
  // Falls im Ort-Feld schon eine PLZ steht, diese entfernen ("12345 Stadt" -> "Stadt").
  const stadt = (ort ?? "").replace(/^\s*\d{5}\s*/, "").trim();
  if (street.length < 2 || stadt.length < 2) return null;
  const stadtKlein = stadt.toLowerCase();

  // 1) Straße + Ort exakt.
  let treffer = await abfrage(
    `${BASIS}?name=${encodeURIComponent(street)}&locality=${encodeURIComponent(stadt)}&page=1&pageSize=10`,
  );

  // 2) Fallback: nur die Straße suchen und selbst nach Ort filtern (fängt Fälle
  //    ab, in denen die kombinierte Suche nichts liefert, z. B. Schreibweisen).
  if (!treffer || treffer.length === 0) {
    const alle = await abfrage(`${BASIS}?name=${encodeURIComponent(street)}&page=1&pageSize=50`);
    treffer = (alle ?? []).filter((d) => (d.locality ?? "").toLowerCase() === stadtKlein);
  }

  if (!treffer || treffer.length === 0) return null;
  const beste = treffer.find((d) => (d.locality ?? "").toLowerCase() === stadtKlein) ?? treffer[0];
  const plz = beste?.postalCode ?? "";
  return /^\d{5}$/.test(plz) ? plz : null;
}
