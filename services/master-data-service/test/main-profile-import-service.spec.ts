import { describe, expect, it, vi } from "vitest";

import { MainProfilesService } from "../src/modules/master-data/main-profiles/main-profiles.service";
import type { NormalizedMainProfileImportRow } from "../src/modules/master-data/main-profiles/main-profile-import.parser";
import type { CreateMainProfileRecord } from "../src/modules/master-data/main-profiles/main-profiles.repository";

function row(
  overrides: Partial<NormalizedMainProfileImportRow>
): NormalizedMainProfileImportRow {
  return {
    rowIndex: 2,
    productCode: "PRD-1",
    productName: "Product 1",
    profileCode: "PROFA",
    profileName: "Profile A",
    mainProfileMarker: "Evet",
    cuttingCode: "PROFA-CUT-1",
    cuttingName: "Cut 1",
    cuttingLengthMm: 100,
    unitName: "mm",
    unitQuantity: 1,
    stockLengthMm: 6000,
    isValid: true,
    validationErrors: [],
    ...overrides
  };
}

describe("MainProfilesService import ownership", () => {
  it("moves a cutting spec to the profile encoded in cuttingCode when Excel context points at another profile", async () => {
    const parsedRows = [
      row({ cuttingCode: "PROFA-CUT-1" }),
      row({
        rowIndex: 3,
        cuttingCode: "PROFB-CUT-2",
        cuttingName: "Cut 2"
      }),
      row({
        rowIndex: 4,
        profileCode: "PROFB",
        profileName: "Profile B",
        cuttingCode: "PROFB-CUT-1",
        cuttingName: "Cut 1"
      })
    ];
    const upsertImportedProfiles = vi.fn(
      async (records: CreateMainProfileRecord[]) => records.map((record, index) => ({
        ...record,
        id: `profile-${index + 1}`,
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z"
      }))
    );
    const service = new MainProfilesService(
      {
        upsertImportedProfiles,
        createImportBatch: vi.fn(async (input) => ({
          ...input,
          id: "batch-1",
          createdAt: "2026-04-30T00:00:00.000Z"
        }))
      } as never,
      {
        parseWorkbook: vi.fn(() => ({
          sheetName: "Profil-Kesim",
          totalRowCount: parsedRows.length,
          validRowCount: parsedRows.length,
          invalidRowCount: 0,
          rows: parsedRows
        }))
      } as never,
      {
        requestReconcileSoon: vi.fn()
      } as never
    );

    const result = await service.createImport({
      originalname: "profile-import.xlsx",
      size: 1,
      buffer: Buffer.from([1]),
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    expect(result.importedProfileCount).toBe(2);
    expect(result.importedCuttingSpecCount).toBe(3);
    expect(upsertImportedProfiles).toHaveBeenCalledTimes(1);
    expect(upsertImportedProfiles.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        code: "PROFA",
        cuttingSpecs: [
          expect.objectContaining({ cuttingCode: "PROFA-CUT-1" })
        ]
      }),
      expect.objectContaining({
        code: "PROFB",
        name: "Profile B",
        cuttingSpecs: [
          expect.objectContaining({ cuttingCode: "PROFB-CUT-2" }),
          expect.objectContaining({ cuttingCode: "PROFB-CUT-1" })
        ]
      })
    ]);
  });
});
