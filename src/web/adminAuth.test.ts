import { describe, it, expect } from "vitest";
import { passwortHashErzeugen, passwortOk, hatAdminSitzung } from "./adminAuth.js";
import type { FastifyRequest } from "fastify";

function reqMitCookie(cookie: string | undefined): FastifyRequest {
  return { headers: cookie === undefined ? {} : { cookie } } as FastifyRequest;
}

describe("stasi-Login: Passwort-Hash (scrypt)", () => {
  it("richtiges Passwort passt, falsches nicht", () => {
    const hash = passwortHashErzeugen("Geheim-123!");
    expect(hash.startsWith("scrypt.")).toBe(true);
    expect(passwortOk("Geheim-123!", hash)).toBe(true);
    expect(passwortOk("geheim-123!", hash)).toBe(false);
    expect(passwortOk("", hash)).toBe(false);
  });

  it("zwei Hashes desselben Passworts sind verschieden (Salt), passen aber beide", () => {
    const a = passwortHashErzeugen("gleich");
    const b = passwortHashErzeugen("gleich");
    expect(a).not.toBe(b);
    expect(passwortOk("gleich", a)).toBe(true);
    expect(passwortOk("gleich", b)).toBe(true);
  });

  it("kaputte/fremde Hash-Formate werden abgelehnt (kein Absturz)", () => {
    expect(passwortOk("x", "")).toBe(false);
    expect(passwortOk("x", "bcrypt.abc.def")).toBe(false);
    expect(passwortOk("x", "scrypt.nur-zwei-teile")).toBe(false);
  });
});

describe("stasi-Login: Sitzungs-Cookie", () => {
  it("ohne Cookie keine Sitzung", () => {
    expect(hatAdminSitzung(reqMitCookie(undefined))).toBe(false);
    expect(hatAdminSitzung(reqMitCookie("anderes=zeug"))).toBe(false);
  });

  it("manipulierte oder abgelaufene Werte werden abgelehnt", () => {
    // Signatur passt nicht (frei erfunden)
    expect(hatAdminSitzung(reqMitCookie(`ab_stasi=stasi.${Date.now() + 60000}.gefaelschte-signatur`))).toBe(false);
    // Falscher Aufbau
    expect(hatAdminSitzung(reqMitCookie("ab_stasi=nur-ein-teil"))).toBe(false);
  });
});
