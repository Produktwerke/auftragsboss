import { describe, it, expect } from "vitest";
import { liesBegrenzt, MediumZuGross } from "./media.js";

function antwort(bytes: Buffer, contentLength?: number): Response {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  // In 3 Häppchen streamen, damit die Kappung mitten im Strom greift.
  const teil = Math.ceil(bytes.length / 3) || 1;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += teil) controller.enqueue(new Uint8Array(bytes.subarray(i, i + teil)));
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

describe("liesBegrenzt (Medien-Größenkappung, F-03)", () => {
  it("liefert kleine Antworten vollständig", async () => {
    const daten = Buffer.alloc(3000, 5);
    const gelesen = await liesBegrenzt(antwort(daten, 3000), 5000);
    expect(gelesen.length).toBe(3000);
    expect(gelesen.equals(daten)).toBe(true);
  });

  it("bricht anhand von Content-Length ab, bevor etwas gelesen wird", async () => {
    await expect(liesBegrenzt(antwort(Buffer.alloc(10), 9_000_000), 5000)).rejects.toBeInstanceOf(MediumZuGross);
  });

  it("bricht im Strom ab, wenn Content-Length fehlt oder lügt", async () => {
    await expect(liesBegrenzt(antwort(Buffer.alloc(9000, 1)), 5000)).rejects.toBeInstanceOf(MediumZuGross);
    await expect(liesBegrenzt(antwort(Buffer.alloc(9000, 1), 100), 5000)).rejects.toBeInstanceOf(MediumZuGross);
  });
});
