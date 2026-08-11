import { describe, it, expect } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  nummerPasst,
  setzeGeraetevertrauen,
  hatGeraetevertrauen,
  darfZugreifen,
  zugangGesperrt,
  merkeFehlversuch,
  setzeVersucheZurueck,
} from "./geraetevertrauen.js";

// ── Hilfsattrappen für req/reply ──
function fakeReply(): FastifyReply & { _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    header(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return this;
    },
  } as unknown as FastifyReply & { _headers: Record<string, string> };
}
function reqMitCookie(setCookieHeader: string): FastifyRequest {
  const paar = setCookieHeader.split(";")[0] ?? ""; // "ab_geraet=..."
  return { headers: { cookie: paar } } as unknown as FastifyRequest;
}
const reqOhneCookie = { headers: {} } as unknown as FastifyRequest;

describe("nummerPasst: tolerante Normalisierung", () => {
  it("erkennt dieselbe Nummer in verschiedenen Schreibweisen", () => {
    const hinterlegt = "491749364823";
    expect(nummerPasst("0174 9364823", hinterlegt)).toBe(true);
    expect(nummerPasst("+49 174 9364823", hinterlegt)).toBe(true);
    expect(nummerPasst("0049 174 9364823", hinterlegt)).toBe(true);
    expect(nummerPasst("491749364823", hinterlegt)).toBe(true);
    expect(nummerPasst("(0174) 936-4823", hinterlegt)).toBe(true);
  });
  it("weist eine andere Nummer ab", () => {
    expect(nummerPasst("0174 1111111", "491749364823")).toBe(false);
    expect(nummerPasst("", "491749364823")).toBe(false);
    expect(nummerPasst("123", "491749364823")).toBe(false); // zu kurz
  });
});

describe("Geräte-Vertrauen: Cookie signieren und prüfen", () => {
  it("ein gesetztes Cookie wird für denselben Betrieb akzeptiert", () => {
    const reply = fakeReply();
    setzeGeraetevertrauen(reply, "hw-1");
    const req = reqMitCookie(reply._headers["set-cookie"]!);
    expect(hatGeraetevertrauen(req, "hw-1")).toBe(true);
  });
  it("gilt NICHT für einen anderen Betrieb", () => {
    const reply = fakeReply();
    setzeGeraetevertrauen(reply, "hw-1");
    const req = reqMitCookie(reply._headers["set-cookie"]!);
    expect(hatGeraetevertrauen(req, "hw-2")).toBe(false);
  });
  it("ein manipuliertes Cookie wird abgelehnt", () => {
    const reply = fakeReply();
    setzeGeraetevertrauen(reply, "hw-1");
    const roh = reply._headers["set-cookie"]!.split(";")[0]!; // ab_geraet=...
    const verfälscht = roh.slice(0, -1) + (roh.endsWith("a") ? "b" : "a");
    const req = { headers: { cookie: verfälscht } } as unknown as FastifyRequest;
    expect(hatGeraetevertrauen(req, "hw-1")).toBe(false);
  });
  it("ohne Cookie kein Zugriff — außer für Test-Konten", () => {
    expect(hatGeraetevertrauen(reqOhneCookie, "hw-1")).toBe(false);
    expect(darfZugreifen(reqOhneCookie, "hw-1", false)).toBe(false);
    expect(darfZugreifen(reqOhneCookie, "hw-1", true)).toBe(true); // istTest
  });
});

describe("Fehlversuch-Sperre", () => {
  it("sperrt nach fünf Fehlversuchen und lässt sich zurücksetzen", () => {
    const token = "test-token-sperre";
    expect(zugangGesperrt(token).gesperrt).toBe(false);
    for (let i = 0; i < 5; i++) merkeFehlversuch(token);
    expect(zugangGesperrt(token).gesperrt).toBe(true);
    setzeVersucheZurueck(token);
    expect(zugangGesperrt(token).gesperrt).toBe(false);
  });
});
