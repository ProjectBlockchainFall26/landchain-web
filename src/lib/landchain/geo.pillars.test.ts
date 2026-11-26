import { describe, expect, it } from "vitest";
import { parsePillars, SAMPLE_PILLARS_CSV } from "./geo";

describe("parsePillars", () => {
  it("reads the sample surveyor file", () => {
    expect(parsePillars(SAMPLE_PILLARS_CSV)).toEqual([
      [5.745663, -0.226286],
      [5.7457, -0.22479],
      [5.74414, -0.22476],
      [5.7441, -0.22627],
    ]);
  });
  it("accepts tabs, semicolons and a closed ring", () => {
    expect(
      parsePillars("5.1;-0.2\n5.2\t-0.2\n5.2 -0.1\n5.1,-0.2"),
    ).toHaveLength(3);
  });
  it("needs three pillars", () => {
    expect(() => parsePillars("lat,lng\n5.1,-0.2")).toThrow(/at least 3/);
  });
});
