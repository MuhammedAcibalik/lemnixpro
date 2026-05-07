import { BadRequestException, Injectable } from "@nestjs/common";
import { read, utils, type CellObject, type WorkBook, type WorkSheet } from "xlsx";

export const MAX_PROFILE_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PROFILE_IMPORT_DATA_ROWS = 20_000;

const REQUIRED_HEADER_MAPPINGS = [
  { sourceHeader: "Ana ürün kodu", aliases: ["Ana ürün kodu"], field: "productCode" },
  { sourceHeader: "Ana ürün adı", aliases: ["Ana ürün adı"], field: "productName" },
  { sourceHeader: "Profil kodu", aliases: ["Profil kodu"], field: "profileCode" },
  { sourceHeader: "Profil adı", aliases: ["Profil adı"], field: "profileName" },
  { sourceHeader: "Ana profil", aliases: ["Ana profil"], field: "mainProfileMarker" },
  { sourceHeader: "Kesim kodu", aliases: ["Kesim kodu"], field: "cuttingCode" },
  { sourceHeader: "Kesim adı", aliases: ["Kesim adı"], field: "cuttingName" },
  { sourceHeader: "Ölçü (mm)", aliases: ["Ölçü (mm)", "Olcu (mm)"], field: "cuttingLengthMm" },
  { sourceHeader: "Birim", aliases: ["Birim"], field: "unitName" },
  {
    sourceHeader: "Birim başına adet",
    aliases: ["Birim başına adet", "Birim basina adet"],
    field: "unitQuantity"
  },
  { sourceHeader: "Stok boyu (mm)", aliases: ["Stok boyu (mm)"], field: "stockLengthMm" }
] as const;

type HeaderMapping = (typeof REQUIRED_HEADER_MAPPINGS)[number];
type ProfileImportField = HeaderMapping["field"];

type SelectedWorksheet = {
  sheetName: string;
  worksheet: WorkSheet;
  headerRowIndex: number;
  rangeStartColumn: number;
  rangeEndColumn: number;
  mappedColumns: Record<ProfileImportField, number>;
};

export type NormalizedMainProfileImportRow = {
  rowIndex: number;
  productCode: string | null;
  productName: string | null;
  profileCode: string | null;
  profileName: string | null;
  mainProfileMarker: string | null;
  cuttingCode: string | null;
  cuttingName: string | null;
  cuttingLengthMm: number | null;
  unitName: string | null;
  unitQuantity: number | null;
  stockLengthMm: number | null;
  isValid: boolean;
  validationErrors: string[];
};

type CarryForwardImportContext = Partial<
  Pick<
    NormalizedMainProfileImportRow,
    | "productCode"
    | "productName"
    | "profileCode"
    | "profileName"
    | "mainProfileMarker"
    | "unitName"
    | "stockLengthMm"
  >
>;

export type ParsedMainProfileImport = {
  sheetName: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rows: NormalizedMainProfileImportRow[];
};

@Injectable()
export class MainProfileImportParser {
  parseWorkbook(fileName: string, fileBuffer: Buffer): ParsedMainProfileImport {
    let workbook: WorkBook;

    try {
      workbook = read(fileBuffer, {
        type: "buffer",
        cellDates: true
      });
    } catch {
      throw new BadRequestException(
        `"${fileName}" okunabilir bir .xlsx profil dosyası değil.`
      );
    }

    const selectedWorksheet = this.findSelectedWorksheet(workbook);

    if (!selectedWorksheet) {
      throw new BadRequestException(
        "Yüklenen dosyada Profil Yönetimi için zorunlu kolonlar bulunamadı."
      );
    }

    const rows = this.parseWorksheetRows(selectedWorksheet);

    if (rows.length === 0) {
      throw new BadRequestException("Profil dosyasında veri satırı bulunamadı.");
    }

    const validRowCount = rows.filter((row) => row.isValid).length;

    return {
      sheetName: selectedWorksheet.sheetName,
      totalRowCount: rows.length,
      validRowCount,
      invalidRowCount: rows.length - validRowCount,
      rows
    };
  }

  private findSelectedWorksheet(workbook: WorkBook): SelectedWorksheet | null {
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        continue;
      }

      const selectedWorksheet = this.inspectWorksheet(sheetName, worksheet);

      if (selectedWorksheet) {
        return selectedWorksheet;
      }
    }

    return null;
  }

  private inspectWorksheet(
    sheetName: string,
    worksheet: WorkSheet
  ): SelectedWorksheet | null {
    const reference = worksheet["!ref"];

    if (!reference) {
      return null;
    }

    const range = utils.decode_range(reference);
    const headerRowIndex = this.findFirstNonBlankRowIndex(
      worksheet,
      range.s.c,
      range.e.c,
      range.s.r,
      range.e.r
    );

    if (headerRowIndex === null) {
      return null;
    }

    const mappedColumns = {} as Record<ProfileImportField, number>;

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const headerName = this.normalizeTextValue(
        this.getWorksheetCell(worksheet, headerRowIndex, columnIndex)
      );

      if (!headerName) {
        continue;
      }

      const normalizedHeaderName = this.normalizeHeaderName(headerName);
      const mapping = REQUIRED_HEADER_MAPPINGS.find((entry) =>
        entry.aliases.some(
          (alias) => this.normalizeHeaderName(alias) === normalizedHeaderName
        )
      );

      if (mapping && mappedColumns[mapping.field] === undefined) {
        mappedColumns[mapping.field] = columnIndex;
      }
    }

    const hasAllRequiredHeaders = REQUIRED_HEADER_MAPPINGS.every(
      (mapping) => mappedColumns[mapping.field] !== undefined
    );

    return hasAllRequiredHeaders
      ? {
          sheetName,
          worksheet,
          headerRowIndex,
          rangeStartColumn: range.s.c,
          rangeEndColumn: range.e.c,
          mappedColumns
        }
      : null;
  }

  private parseWorksheetRows(
    selectedWorksheet: SelectedWorksheet
  ): NormalizedMainProfileImportRow[] {
    const reference = selectedWorksheet.worksheet["!ref"];

    if (!reference) {
      return [];
    }

    const range = utils.decode_range(reference);
    const rows: NormalizedMainProfileImportRow[] = [];
    let carryForwardContext: CarryForwardImportContext = {};

    for (
      let rowIndex = selectedWorksheet.headerRowIndex + 1;
      rowIndex <= range.e.r;
      rowIndex += 1
    ) {
      if (
        this.isWorksheetRowBlank(
          selectedWorksheet.worksheet,
          selectedWorksheet.rangeStartColumn,
          selectedWorksheet.rangeEndColumn,
          rowIndex
        )
      ) {
        carryForwardContext = {};
        continue;
      }

      if (rows.length >= MAX_PROFILE_IMPORT_DATA_ROWS) {
        throw new BadRequestException(
          `Profil dosyası en fazla ${MAX_PROFILE_IMPORT_DATA_ROWS} veri satırı içerebilir.`
        );
      }

      const normalizedRow = this.normalizeRow(
        selectedWorksheet,
        rowIndex,
        carryForwardContext
      );

      rows.push(normalizedRow);
      this.updateCarryForwardContext(carryForwardContext, normalizedRow);
    }

    return rows;
  }

  private normalizeRow(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number,
    carryForwardContext: CarryForwardImportContext
  ): NormalizedMainProfileImportRow {
    const productCode =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "productCode")
      ) ??
      carryForwardContext.productCode ??
      null;
    const productName =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "productName")
      ) ??
      carryForwardContext.productName ??
      null;
    const profileCode =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "profileCode")
      ) ??
      carryForwardContext.profileCode ??
      null;
    const profileName =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "profileName")
      ) ??
      carryForwardContext.profileName ??
      null;
    const mainProfileMarker =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "mainProfileMarker")
      ) ??
      carryForwardContext.mainProfileMarker ??
      null;
    const cuttingCode = this.normalizeTextValue(
      this.readMappedCell(selectedWorksheet, rowIndex, "cuttingCode")
    );
    const cuttingName = this.normalizeTextValue(
      this.readMappedCell(selectedWorksheet, rowIndex, "cuttingName")
    );
    const cuttingLengthMm = this.parsePositiveMeasurement(
      this.readMappedCell(selectedWorksheet, rowIndex, "cuttingLengthMm")
    );
    const unitName =
      this.normalizeTextValue(
        this.readMappedCell(selectedWorksheet, rowIndex, "unitName")
      ) ??
      carryForwardContext.unitName ??
      null;
    const unitQuantity = this.parsePositiveNumber(
      this.readMappedCell(selectedWorksheet, rowIndex, "unitQuantity")
    );
    const stockLengthMm =
      this.parsePositiveMeasurement(
        this.readMappedCell(selectedWorksheet, rowIndex, "stockLengthMm")
      ) ??
      carryForwardContext.stockLengthMm ??
      null;
    const validationErrors: string[] = [];

    for (const [fieldName, value] of Object.entries({
      productCode,
      productName,
      profileCode,
      profileName,
      cuttingCode,
      cuttingName,
      unitName
    })) {
      if (!value) {
        validationErrors.push(`${fieldName} zorunludur.`);
      }
    }

    if (cuttingLengthMm === null) {
      validationErrors.push("Ölçü (mm) pozitif sayı olmalıdır.");
    }

    if (unitQuantity === null) {
      validationErrors.push("Birim başına adet pozitif sayı olmalıdır.");
    }

    if (stockLengthMm === null) {
      validationErrors.push("Stok boyu (mm) pozitif sayı olmalıdır.");
    }

    return {
      rowIndex: rowIndex + 1,
      productCode,
      productName,
      profileCode,
      profileName,
      mainProfileMarker,
      cuttingCode,
      cuttingName,
      cuttingLengthMm,
      unitName,
      unitQuantity,
      stockLengthMm,
      isValid: validationErrors.length === 0,
      validationErrors
    };
  }

  private updateCarryForwardContext(
    context: CarryForwardImportContext,
    row: NormalizedMainProfileImportRow
  ): void {
    context.productCode = row.productCode;
    context.productName = row.productName;
    context.profileCode = row.profileCode;
    context.profileName = row.profileName;
    context.mainProfileMarker = row.mainProfileMarker;
    context.unitName = row.unitName;
    context.stockLengthMm = row.stockLengthMm;
  }

  private readMappedCell(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number,
    field: ProfileImportField
  ): CellObject | undefined {
    return this.getWorksheetCell(
      selectedWorksheet.worksheet,
      rowIndex,
      selectedWorksheet.mappedColumns[field]
    );
  }

  private parsePositiveMeasurement(value: unknown): number | null {
    const parsedValue = this.parseLocaleNumber(value, {
      allowThousandsDot: true
    });

    return parsedValue !== null && parsedValue > 0
      ? Math.round(parsedValue)
      : null;
  }

  private parsePositiveNumber(value: unknown): number | null {
    const parsedValue = this.parseLocaleNumber(value, {
      allowThousandsDot: false
    });

    return parsedValue !== null && parsedValue > 0
      ? Number(parsedValue.toFixed(3))
      : null;
  }

  private parseLocaleNumber(
    value: unknown,
    options: { allowThousandsDot: boolean }
  ): number | null {
    const rawText = this.normalizeTextValue(value);

    if (!rawText) {
      return null;
    }

    const compactText = rawText.replace(/\s+/g, "");
    if (!/^\d+(?:[.,]\d+)*$/.test(compactText)) {
      return null;
    }

    const lastComma = compactText.lastIndexOf(",");
    const lastDot = compactText.lastIndexOf(".");
    let normalizedText = compactText;

    if (lastComma >= 0 && lastDot >= 0) {
      const decimalSeparator = lastComma > lastDot ? "," : ".";
      const thousandsSeparator = decimalSeparator === "," ? "." : ",";
      normalizedText = compactText
        .replaceAll(thousandsSeparator, "")
        .replace(decimalSeparator, ".");
    } else if (lastComma >= 0) {
      const parts = compactText.split(",");
      if (
        options.allowThousandsDot &&
        parts.length === 2 &&
        parts[1]?.length === 3
      ) {
        const collapsedValue = Number(parts.join(""));
        if (Number.isFinite(collapsedValue) && collapsedValue <= 50_000) {
          return collapsedValue;
        }
      }
      normalizedText = compactText.replace(",", ".");
    } else if (lastDot >= 0) {
      const parts = compactText.split(".");
      if (
        options.allowThousandsDot &&
        parts.length === 2 &&
        parts[1]?.length === 3
      ) {
        const collapsedValue = Number(parts.join(""));
        if (Number.isFinite(collapsedValue) && collapsedValue <= 50_000) {
          return collapsedValue;
        }
      }

      normalizedText = parts.length > 2 ? parts.join("") : compactText;
    }

    const parsedValue = Number(normalizedText);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private normalizeTextValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (this.isCellObject(value)) {
      if (typeof value.w === "string" && value.w.trim() !== "") {
        return value.w.trim();
      }

      return this.normalizeTextValue(value.v);
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      return trimmedValue === "" ? null : trimmedValue;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? `${value}` : null;
    }

    return null;
  }

  private findFirstNonBlankRowIndex(
    worksheet: WorkSheet,
    startColumn: number,
    endColumn: number,
    startRow: number,
    endRow: number
  ): number | null {
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      if (!this.isWorksheetRowBlank(worksheet, startColumn, endColumn, rowIndex)) {
        return rowIndex;
      }
    }

    return null;
  }

  private isWorksheetRowBlank(
    worksheet: WorkSheet,
    startColumn: number,
    endColumn: number,
    rowIndex: number
  ): boolean {
    for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
      const cell = this.getWorksheetCell(worksheet, rowIndex, columnIndex);

      if (this.normalizeTextValue(cell) !== null) {
        return false;
      }
    }

    return true;
  }

  private getWorksheetCell(
    worksheet: WorkSheet,
    rowIndex: number,
    columnIndex: number
  ): CellObject | undefined {
    const cell = worksheet[utils.encode_cell({ r: rowIndex, c: columnIndex })] as
      | CellObject
      | undefined;

    if (cell) {
      return cell;
    }

    const merges = worksheet["!merges"] as
      | Array<{
          s: { r: number; c: number };
          e: { r: number; c: number };
        }>
      | undefined;

    const containingMerge = merges?.find(
      (merge) =>
        rowIndex >= merge.s.r &&
        rowIndex <= merge.e.r &&
        columnIndex >= merge.s.c &&
        columnIndex <= merge.e.c
    );

    if (!containingMerge) {
      return undefined;
    }

    return worksheet[
      utils.encode_cell({ r: containingMerge.s.r, c: containingMerge.s.c })
    ] as CellObject | undefined;
  }

  private normalizeHeaderName(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
  }

  private isCellObject(value: unknown): value is CellObject {
    return (
      typeof value === "object" &&
      value !== null &&
      ("v" in value || "w" in value || "t" in value)
    );
  }
}
