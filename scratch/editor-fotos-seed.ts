// Einmalig für die lokale Vorschau: hängt zwei Messbank-Fotos und Aufmaßnotizen an das jüngste Demo-Dokument (dev.db).
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { speichereFoto } from "../src/betrieb/fotoAblage.js";
const prisma = new PrismaClient();
const dok = await prisma.dokument.findFirst({ orderBy: { datum: "desc" } });
if (!dok) throw new Error("kein Dokument in dev.db, erst den Dev-Editor starten");
const bilder = [
  ["Messbank/Raumfotos Whatsapp/WhatsApp Image 2026-09-04 at 18.51.00 (1).jpeg", { istWandfoto: true, notizText: null, wandKomplett: true, bodenSichtbar: true, hellGenug: true, besonderheiten: ["Holzpaneele bis ca. 1,10 m"], oeffnungen: [{ art: "Fenstertuer", inNachbarwand: false, offen: false, breiteM: 1.7, hoeheM: 2.3, sicherheit: "hoch" }] }],
  ["Messbank/Raumfotos Whatsapp/WhatsApp Image 2026-09-04 at 18.51.00 (2).jpeg", { istWandfoto: true, notizText: null, wandKomplett: false, bodenSichtbar: true, hellGenug: true, besonderheiten: [], oeffnungen: [{ art: "Tuer", inNachbarwand: false, offen: false, breiteM: 0.86, hoeheM: 2.0, sicherheit: "hoch" }] }],
] as const;
await prisma.foto.deleteMany({ where: { dokumentId: dok.id } });
let n = 0;
for (const [pfad, erkennung] of bilder) {
  n++;
  const daten = readFileSync(pfad);
  const datei = speichereFoto({ handwerkerId: dok.handwerkerId, vorgangId: "demo", wandNr: n, daten, mimeType: "image/jpeg" });
  await prisma.foto.create({ data: { handwerkerId: dok.handwerkerId, dokumentId: dok.id, raum: "Wohnzimmer", wandNr: n, datei, mimeType: "image/jpeg", groesse: daten.length, erkennungJson: JSON.stringify(erkennung) } });
}
await prisma.dokument.update({ where: { id: dok.id }, data: { aufmassNotizen: "Wohnzimmer (Höhe 2,52 m, 4,49 × 4,36 m): Wandfläche brutto 44,60 m²; 1 Öffnung über 2,5 m² abgezogen (Fenstertür 1,7 × 2,3 m = 3,91 m²); 1 Öffnung bis 2,5 m² übermessen (Tür 0,86 × 2 m); Laibungen der abgezogenen Öffnungen nicht enthalten (Tiefe nicht genannt); Wandfläche netto 40,69 m²; Decke 19,58 m²." } });
console.log("Demo-Dokument", dok.nummer, "mit", n, "Fotos; Link: http://localhost:3020/a/" + dok.bearbeitenToken);
await prisma.$disconnect();
