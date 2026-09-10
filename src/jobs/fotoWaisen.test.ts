import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// UPLOADS_DIR muss vor dem Import der Ablage gesetzt sein (FOTO_DIR wird beim Laden gebildet).
const wurzel = mkdtempSync(join(tmpdir(), "fotowaisen-"));
process.env.UPLOADS_DIR = wurzel;
const { raeumeFotoWaisenAuf, WAISEN_AUFBEWAHRUNG_TAGE } = await import("./fotoWaisen.js");
const fotoDir = join(wurzel, "fotos");

type Zeile = { id: string; datei: string; dokumentId: string | null; erstelltAm: Date };

function attrappe(zeilen: Zeile[], dokumente: string[]) {
  const geloescht: string[] = [];
  const passt = (z: Zeile, where: Record<string, unknown>): boolean => {
    if (where.datei !== undefined && z.datei !== where.datei) return false;
    if (where.dokumentId === null && z.dokumentId !== null) return false;
    if (typeof where.dokumentId === "object" && where.dokumentId !== null && z.dokumentId === null) return false;
    const e = where.erstelltAm as { lt: Date } | undefined;
    if (e && !(z.erstelltAm < e.lt)) return false;
    return true;
  };
  const db = {
    foto: {
      async findMany(args: { where?: Record<string, unknown> }) {
        return zeilen.filter((z) => !geloescht.includes(z.id) && passt(z, args.where ?? {}));
      },
      async deleteMany(args: { where: { id: { in: string[] } } }) {
        geloescht.push(...args.where.id.in);
        return { count: args.where.id.in.length };
      },
    },
    dokument: {
      async findMany(args: { where: { id: { in: string[] } } }) {
        return dokumente.filter((d) => args.where.id.in.includes(d)).map((id) => ({ id }));
      },
    },
  };
  return { db, geloescht };
}

function legeDatei(rel: string, alterStunden = 0): string {
  const voll = join(wurzel, rel.replace(/^uploads\//, ""));
  mkdirSync(join(voll, ".."), { recursive: true });
  writeFileSync(voll, "bild");
  if (alterStunden) {
    const t = new Date(Date.now() - alterStunden * 3600_000);
    utimesSync(voll, t, t);
  }
  return voll;
}

beforeEach(() => rmSync(fotoDir, { recursive: true, force: true }));
afterEach(() => rmSync(fotoDir, { recursive: true, force: true }));

describe("raeumeFotoWaisenAuf (F-02)", () => {
  it("löscht Zeilen ohne Datei, Fotos gelöschter Angebote und abgelaufene Fotos ohne Angebot (Datei + Zeile)", async () => {
    const jetzt = new Date("2026-09-10T04:10:00Z");
    const alt = new Date(jetzt.getTime() - (WAISEN_AUFBEWAHRUNG_TAGE + 1) * 86400_000);
    const frisch = new Date(jetzt.getTime() - 2 * 86400_000);
    const dateiWeg = legeDatei("uploads/fotos/hw1/vg1/wand1_a.jpg");
    const dateiAlt = legeDatei("uploads/fotos/hw1/vg2/wand1_b.jpg");
    const dateiFrisch = legeDatei("uploads/fotos/hw1/vg3/wand1_c.jpg");
    const dateiBeleg = legeDatei("uploads/fotos/hw1/vg4/wand1_d.jpg");
    const { db, geloescht } = attrappe(
      [
        { id: "leer", datei: "", dokumentId: null, erstelltAm: frisch },
        { id: "weg", datei: "uploads/fotos/hw1/vg1/wand1_a.jpg", dokumentId: "dok-geloescht", erstelltAm: frisch },
        { id: "alt", datei: "uploads/fotos/hw1/vg2/wand1_b.jpg", dokumentId: null, erstelltAm: alt },
        { id: "frisch", datei: "uploads/fotos/hw1/vg3/wand1_c.jpg", dokumentId: null, erstelltAm: frisch },
        { id: "beleg", datei: "uploads/fotos/hw1/vg4/wand1_d.jpg", dokumentId: "dok-1", erstelltAm: alt },
      ],
      ["dok-1"],
    );
    const e = await raeumeFotoWaisenAuf(db, { jetzt, fotoDir });
    expect(e).toEqual({ ohneDatei: 1, angebotWeg: 1, abgelaufen: 1, dateienOhneZeile: 0 });
    expect(geloescht.sort()).toEqual(["alt", "leer", "weg"]);
    expect(existsSync(dateiWeg)).toBe(false);
    expect(existsSync(dateiAlt)).toBe(false);
    expect(existsSync(dateiFrisch)).toBe(true);
    expect(existsSync(dateiBeleg)).toBe(true);
  });

  it("entfernt Dateien ohne Zeile erst nach 24 h Karenz und räumt leere Ordner weg", async () => {
    const jetzt = new Date();
    const alt = legeDatei("uploads/fotos/hwX/vgX/wand1_alt.jpg", 30);
    const neu = legeDatei("uploads/fotos/hwX/vgY/wand1_neu.jpg", 1);
    const bekannt = legeDatei("uploads/fotos/hwZ/vgZ/wand1_ok.jpg", 100);
    const { db } = attrappe([{ id: "ok", datei: "uploads/fotos/hwZ/vgZ/wand1_ok.jpg", dokumentId: "d", erstelltAm: jetzt }], ["d"]);
    const e = await raeumeFotoWaisenAuf(db, { jetzt, fotoDir });
    expect(e.dateienOhneZeile).toBe(1);
    expect(existsSync(alt)).toBe(false);
    expect(existsSync(join(fotoDir, "hwX", "vgX"))).toBe(false); // leerer Vorgangsordner weg
    expect(existsSync(neu)).toBe(true);
    expect(existsSync(bekannt)).toBe(true);
  });
});
