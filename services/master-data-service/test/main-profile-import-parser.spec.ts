import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";

import { MainProfileImportParser } from "../src/modules/master-data/main-profiles/main-profile-import.parser";

const headers = [
  "Ana ürün kodu",
  "Ana ürün adı",
  "Profil kodu",
  "Profil adı",
  "Ana profil",
  "Kesim kodu",
  "Kesim adı",
  "Ölçü (mm)",
  "Birim",
  "Birim başına adet",
  "Stok boyu (mm)"
] as const;

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = utils.book_new();
  const worksheet = utils.aoa_to_sheet([[...headers], ...rows]);
  utils.book_append_sheet(workbook, worksheet, "Profil-Kesim");

  return write(workbook, {
    bookType: "xlsx",
    type: "buffer"
  }) as Buffer;
}

describe("MainProfileImportParser", () => {
  it("fills grouped profile context into subsequent cutting rows", () => {
    const parser = new MainProfileImportParser();
    const parsed = parser.parseWorkbook(
      "profile-import.xlsx",
      workbookBuffer([
        [
          "PRD-1",
          "Product 1",
          "PROF-1",
          "Profile 1",
          "Evet",
          "PROF-1-CUT-1",
          "Cut 1",
          100,
          "mm",
          2,
          6000
        ],
        [
          null,
          null,
          null,
          null,
          null,
          "PROF-1-CUT-2",
          "Cut 2",
          120,
          null,
          4,
          null
        ]
      ])
    );

    expect(parsed.totalRowCount).toBe(2);
    expect(parsed.validRowCount).toBe(2);
    expect(parsed.invalidRowCount).toBe(0);
    expect(parsed.rows[1]).toMatchObject({
      productCode: "PRD-1",
      productName: "Product 1",
      profileCode: "PROF-1",
      profileName: "Profile 1",
      unitName: "mm",
      stockLengthMm: 6000,
      cuttingCode: "PROF-1-CUT-2"
    });
  });

  it("uses merged header-context cells for cutting rows under the same profile", () => {
    const workbook = utils.book_new();
    const worksheet = utils.aoa_to_sheet([
      [...headers],
      [
        "PRD-2",
        "Product 2",
        "PROF-2",
        "Profile 2",
        "Evet",
        "PROF-2-CUT-1",
        "Cut 1",
        100,
        "mm",
        1,
        6100
      ],
      [
        null,
        null,
        null,
        null,
        null,
        "PROF-2-CUT-2",
        "Cut 2",
        150,
        null,
        3,
        null
      ]
    ]);
    worksheet["!merges"] = [
      { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
      { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
      { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } },
      { s: { r: 1, c: 8 }, e: { r: 2, c: 8 } },
      { s: { r: 1, c: 10 }, e: { r: 2, c: 10 } }
    ];
    utils.book_append_sheet(workbook, worksheet, "Profil-Kesim");

    const parser = new MainProfileImportParser();
    const parsed = parser.parseWorkbook(
      "profile-import.xlsx",
      write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer
    );

    expect(parsed.validRowCount).toBe(2);
    expect(parsed.rows[1]).toMatchObject({
      productCode: "PRD-2",
      profileCode: "PROF-2",
      unitName: "mm",
      stockLengthMm: 6100,
      cuttingCode: "PROF-2-CUT-2"
    });
  });

  it("parses decimal cutting measurements without turning them into tenfold lengths", () => {
    const parser = new MainProfileImportParser();
    const parsed = parser.parseWorkbook(
      "profile-import.xlsx",
      workbookBuffer([
        [
          "PRD-3",
          "Product 3",
          "PROF-3",
          "Profile 3",
          "Evet",
          "PROF-3-CUT-1",
          "Cut 778.5",
          "778.5",
          "mm",
          "1.000",
          "6.100"
        ]
      ])
    );

    expect(parsed.validRowCount).toBe(1);
    expect(parsed.rows[0]).toMatchObject({
      cuttingLengthMm: 779,
      unitQuantity: 1,
      stockLengthMm: 6100
    });
  });
});
