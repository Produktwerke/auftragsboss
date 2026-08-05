import { defineConfig } from "vitest/config";

// Testnetz für den Maler-Umbau. Reine Unit-/Logiktests ohne API-Keys und ohne
// echte Datenbank (Prisma wird in den Tests gestubbt). Sichert die kritischen
// Garantien ab: keine erfundenen Preise, Herkunft bleibt erhalten, strikte
// Mandantentrennung, korrekte Summen.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
