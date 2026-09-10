// Räumt verwaiste Wandfotos auf (Nach-Audit 10.09., F-02).
//
// Wandfotos sind Kundendaten (Innenräume). Aufbewahrung:
//   • Belegfotos eines Angebots leben so lange wie das Angebot (werden mit ihm gelöscht).
//   • Fotos ohne Angebot (Vorgang abgebrochen, Nachtrag ins Leere) werden nach
//     WAISEN_AUFBEWAHRUNG_TAGE gelöscht, Datei und Datenbankzeile.
//   • Zeilen, deren Angebot nicht mehr existiert, und Zeilen ohne Datei werden sofort entfernt.
//   • Dateien auf der Platte, zu denen keine Zeile gehört (z.B. Reste aus Tests oder
//     einem Vorfall), werden nach 24 Stunden gelöscht; leere Ordner gleich mit.
// Läuft täglich um 04:10, nach dem Nacht-Backup.
import cron from "node-cron";
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../pipeline.js";
import { FOTO_DIR, loescheFotoDatei } from "../betrieb/fotoAblage.js";

export const WAISEN_AUFBEWAHRUNG_TAGE = 30;
const DATEI_KARENZ_MS = 24 * 60 * 60 * 1000;

export interface WaisenErgebnis {
  ohneDatei: number;
  angebotWeg: number;
  abgelaufen: number;
  dateienOhneZeile: number;
}

// Nur die Prisma-Fläche, die der Job braucht (so lässt er sich mit einer Attrappe testen).
type FotoDb = {
  foto: {
    findMany(args: unknown): Promise<Array<{ id: string; datei: string; dokumentId: string | null }>>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  dokument: { findMany(args: unknown): Promise<Array<{ id: string }>> };
};

export async function raeumeFotoWaisenAuf(
  db: FotoDb | PrismaClient,
  optionen: { jetzt?: Date; fotoDir?: string } = {},
): Promise<WaisenErgebnis> {
  const jetzt = optionen.jetzt ?? new Date();
  const fotoDir = optionen.fotoDir ?? FOTO_DIR;
  const ergebnis: WaisenErgebnis = { ohneDatei: 0, angebotWeg: 0, abgelaufen: 0, dateienOhneZeile: 0 };
  const grenze = new Date(jetzt.getTime() - WAISEN_AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000);

  // 1) Zeilen ohne Datei (Ablage war gescheitert; seit F-10 entstehen sie nicht mehr).
  const ohneDatei = await db.foto.findMany({ where: { datei: "" }, select: { id: true, datei: true, dokumentId: true } });
  if (ohneDatei.length) {
    await db.foto.deleteMany({ where: { id: { in: ohneDatei.map((f) => f.id) } } });
    ergebnis.ohneDatei = ohneDatei.length;
  }

  // 2) Zeilen, deren Angebot nicht mehr existiert.
  const mitDokument = await db.foto.findMany({ where: { dokumentId: { not: null } }, select: { id: true, datei: true, dokumentId: true } });
  const dokIds = [...new Set(mitDokument.map((f) => f.dokumentId).filter((x): x is string => !!x))];
  const vorhanden = new Set((dokIds.length ? await db.dokument.findMany({ where: { id: { in: dokIds } }, select: { id: true } }) : []).map((d) => d.id));
  const angebotWeg = mitDokument.filter((f) => f.dokumentId && !vorhanden.has(f.dokumentId));
  await loescheZeilen(db, angebotWeg);
  ergebnis.angebotWeg = angebotWeg.length;

  // 3) Fotos ohne Angebot, älter als die Aufbewahrungsfrist.
  const abgelaufen = await db.foto.findMany({
    where: { dokumentId: null, erstelltAm: { lt: grenze } },
    select: { id: true, datei: true, dokumentId: true },
  });
  await loescheZeilen(db, abgelaufen);
  ergebnis.abgelaufen = abgelaufen.length;

  // 4) Dateien ohne Zeile (Platte gegen Datenbank), mit 24 h Karenz für Fotos,
  //    deren Zeile gerade erst entsteht.
  if (existsSync(fotoDir)) {
    const bekannt = new Set((await db.foto.findMany({ select: { id: true, datei: true, dokumentId: true } })).map((f) => f.datei));
    for (const betrieb of unterordner(fotoDir)) {
      for (const vorgang of unterordner(join(fotoDir, betrieb))) {
        const ordner = join(fotoDir, betrieb, vorgang);
        for (const name of readdirSync(ordner)) {
          const voll = join(ordner, name);
          let st;
          try {
            st = statSync(voll);
          } catch {
            continue;
          }
          if (!st.isFile()) continue;
          const rel = ["uploads", "fotos", betrieb, vorgang, name].join("/");
          if (bekannt.has(rel) || jetzt.getTime() - st.mtimeMs < DATEI_KARENZ_MS) continue;
          try {
            unlinkSync(voll);
            ergebnis.dateienOhneZeile++;
          } catch {
            /* gesperrt oder schon weg */
          }
        }
        entferneWennLeer(ordner);
      }
      entferneWennLeer(join(fotoDir, betrieb));
    }
  }
  return ergebnis;
}

async function loescheZeilen(db: FotoDb | PrismaClient, fotos: Array<{ id: string; datei: string }>): Promise<void> {
  if (!fotos.length) return;
  for (const f of fotos) loescheFotoDatei(f.datei);
  await db.foto.deleteMany({ where: { id: { in: fotos.map((f) => f.id) } } });
}

function unterordner(pfad: string): string[] {
  try {
    return readdirSync(pfad, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function entferneWennLeer(pfad: string): void {
  try {
    if (readdirSync(pfad).length === 0) rmdirSync(pfad);
  } catch {
    /* nicht leer oder schon weg */
  }
}

export function starteFotoWaisenJob(): void {
  cron.schedule("10 4 * * *", () => {
    raeumeFotoWaisenAuf(prisma)
      .then((e) => {
        const summe = e.ohneDatei + e.angebotWeg + e.abgelaufen + e.dateienOhneZeile;
        if (summe > 0) console.log(`🧹 Fotowaisen aufgeräumt: ${JSON.stringify(e)}`);
      })
      .catch((err) => console.error("Fotowaisen-Job fehlgeschlagen:", err));
  });
  console.log(`🧹 Fotowaisen-Job geplant (täglich 04:10, Aufbewahrung ohne Angebot ${WAISEN_AUFBEWAHRUNG_TAGE} Tage).`);
}
