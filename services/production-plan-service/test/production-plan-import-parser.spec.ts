import { describe, expect, it } from "vitest";

import {
  ProductionPlanImportParser,
  type ProductionPlanRowCandidate
} from "../src/modules/production-plan/production-plan-import.parser";

const baseCandidate: ProductionPlanRowCandidate = {
  weekRaw: "16",
  customerName: "ACME",
  orderingPartyCode: "1000",
  customerOrderNumber: "45000001",
  customerOrderItemNumber: "10",
  workOrderNumber: "10000001",
  materialCode: "LP-100",
  materialName: "LP Premium RAL9005 A4",
  quantity: "2",
  orderUnit: "ADT",
  plannedFinishDate: "2026-04-15",
  departmentCode: "7",
  priority: "1"
};

function normalize(overrides: Partial<ProductionPlanRowCandidate> = {}) {
  return new ProductionPlanImportParser().normalizePatchedRow(
    {
      ...baseCandidate,
      ...overrides
    },
    {},
    2
  );
}

describe("ProductionPlanImportParser autonomous cut-list fields", () => {
  it.each([
    ["LP Premium R9005 A4", "RAL9005"],
    ["LP Premium RAL9005 A4", "RAL9005"],
    ["LP Premium RAL 9005 A4", "RAL9005"],
    ["LP Premium R7016 A4", "RAL7016"],
    ["LP Premium RAL 9003 A4", "RAL9003"]
  ])("normalizes guarded RAL color token from %s", (materialName, expected) => {
    expect(normalize({ materialName }).materialColor).toBe(expected);
  });

  it("does not guess a bare four digit color code", () => {
    expect(normalize({ materialName: "LP Premium 9005 A4" }).materialColor).toBeNull();
  });

  it.each([
    ["LP Premium R9005 A4 (210 x 297)", "A4"],
    ["LP Premium R9005 B0 (1000 x 1400)", "B0"],
    ["LP Premium R9005 F2 (400 x 600)", "F2"],
    ['LP Premium R9005 20"X30" (508 x 762)', '20"X30"'],
    ['WINDPRO SLIM 22"X60" RAL9005 CERCEVE', '22"X60"'],
    ["CER.25MM RO.G.A.285X750MM(OZEL DELIKLI)", "285X750MM"],
    ["26MM PROF 3000 MM YAYLI VE FITILLI", "3000MM"],
    ["PANEL ABC 205A4X2000 XYZ", "A4"],
    ["FOO 000B0X5000 BAR", "B0"]
  ])("extracts the external size token from %s", (materialName, expected) => {
    expect(normalize({ materialName }).materialSize).toBe(expected);
  });

  it("falls back to SAP-style material code when short text lacks a series marker", () => {
    expect(
      normalize({
        materialName: "NO SIZE MARKER STRING",
        materialCode: "UMBSG205A4X2000"
      }).materialSize
    ).toBe("A4");
  });

  it("does not read A43 as A4 in material codes", () => {
    expect(
      normalize({
        materialName: "NO SIZE MARKER STRING",
        materialCode: "UPB3300A43X2000"
      }).materialSize
    ).toBeNull();
  });

  it("requires planned finish date for valid cut-list generation rows", () => {
    const row = normalize({ plannedFinishDate: null });

    expect(row.isValid).toBe(false);
    expect(row.validationErrors).toContain("Plnl.bitis zorunludur.");
  });
});
