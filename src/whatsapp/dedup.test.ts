import { describe, it, expect } from "vitest";
import { schonVerarbeitet } from "./webhook.js";

describe("Webhook-Deduplizierung (Meta stellt mindestens-einmal zu)", () => {
  it("erste Zustellung nein, Wiederholung ja", () => {
    expect(schonVerarbeitet("wamid.TEST-1")).toBe(false);
    expect(schonVerarbeitet("wamid.TEST-1")).toBe(true);
    expect(schonVerarbeitet("wamid.TEST-2")).toBe(false);
  });

  it("fehlende ID wird nie als Duplikat gewertet", () => {
    expect(schonVerarbeitet(undefined)).toBe(false);
    expect(schonVerarbeitet(undefined)).toBe(false);
  });
});
