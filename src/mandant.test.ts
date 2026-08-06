import { describe, it, expect } from "vitest";
import { erzwingeTenant, FehlenderTenantError } from "./mandant.js";

describe("Tenant-Guard (Mandantentrennung)", () => {
  it("gibt eine gültige handwerkerId zurück", () => {
    expect(erzwingeTenant("hw1", "test")).toBe("hw1");
  });

  it("wirft bei fehlender/leerer handwerkerId (harter Fehler, keine globale Suche)", () => {
    expect(() => erzwingeTenant("", "retrieval")).toThrow(FehlenderTenantError);
    expect(() => erzwingeTenant("   ", "retrieval")).toThrow(FehlenderTenantError);
    expect(() => erzwingeTenant(null, "retrieval")).toThrow(FehlenderTenantError);
    expect(() => erzwingeTenant(undefined, "retrieval")).toThrow(FehlenderTenantError);
  });
});
