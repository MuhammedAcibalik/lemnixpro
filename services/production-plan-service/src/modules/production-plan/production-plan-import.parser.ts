import { BadRequestException, Injectable } from "@nestjs/common";
import {
  SSF,
  read,
  utils,
  type CellObject,
  type WorkBook,
  type WorkSheet
} from "xlsx";

const ORDERING_PARTY_ALIASES = [
  "Sprş.veren",
  "Sipş.veren",
  "Sips.veren",
  "Sprs.veren"
] as const;

const CUSTOMER_ORDER_NO_ALIASES = [
  "Mştr.no.",
  "Mşt.no.",
  "Mstr.no."
] as const;

const CUSTOMER_ORDER_ITEM_ALIASES = [
  "Mştr.klm.",
  "Mşt.klm.",
  "Mstr.klm."
] as const;

const ORDER_UNIT_ALIASES = [
  "Sprş.ÖB",
  "Sipş.OB",
  "Sipş.ÖB",
  "Sprs.OB",
  "Sips.OB"
] as const;

const REQUIRED_HEADER_MAPPINGS = [
  { sourceHeader: "Hafta", aliases: ["Hafta"], field: "weekRaw" },
  { sourceHeader: "Ad", aliases: ["Ad"], field: "customerName" },
  {
    sourceHeader: "Sprş.veren",
    aliases: ORDERING_PARTY_ALIASES,
    field: "orderingPartyCode"
  },
  {
    sourceHeader: "Mştr.no.",
    aliases: CUSTOMER_ORDER_NO_ALIASES,
    field: "customerOrderNumber"
  },
  {
    sourceHeader: "Mştr.klm.",
    aliases: CUSTOMER_ORDER_ITEM_ALIASES,
    field: "customerOrderItemNumber"
  },
  { sourceHeader: "Sipariş", aliases: ["Sipariş"], field: "workOrderNumber" },
  {
    sourceHeader: "Malzeme kısa metni",
    aliases: ["Malzeme kısa metni"],
    field: "materialName"
  },
  {
    sourceHeader: "Sprş.ÖB",
    aliases: ORDER_UNIT_ALIASES,
    field: "orderUnit"
  },
  { sourceHeader: "Plnl.bitiş", aliases: ["Plnl.bitiş"], field: "plannedFinishDate" },
  { sourceHeader: "Bölüm", aliases: ["Bölüm"], field: "departmentCode" },
  { sourceHeader: "Öncelik", aliases: ["Öncelik"], field: "priority" },
  {
    sourceHeader: "Sprş.veren",
    aliases: ORDERING_PARTY_ALIASES,
    field: "orderingPartyCode"
  },
  {
    sourceHeader: "Mştr.no.",
    aliases: CUSTOMER_ORDER_NO_ALIASES,
    field: "customerOrderNumber"
  },
  {
    sourceHeader: "Mştr.klm.",
    aliases: CUSTOMER_ORDER_ITEM_ALIASES,
    field: "customerOrderItemNumber"
  },
  { sourceHeader: "Sipariş", aliases: ["Sipariş", "Siparis"], field: "workOrderNumber" },
  { sourceHeader: "Malzeme no.", aliases: ["Malzeme no.", "Malzeme No"], field: "materialCode" },
  {
    sourceHeader: "Malzeme kısa metni",
    aliases: ["Malzeme kısa metni", "Malzeme kisa metni"],
    field: "materialName"
  },
  { sourceHeader: "Miktar", aliases: ["Miktar"], field: "quantity" },
  {
    sourceHeader: "Sprş.ÖB",
    aliases: ORDER_UNIT_ALIASES,
    field: "orderUnit"
  },
  { sourceHeader: "Plnl.bitiş", aliases: ["Plnl.bitiş", "Plnl.bitis"], field: "plannedFinishDate" },
  { sourceHeader: "Bölüm", aliases: ["Bölüm", "Bolum"], field: "departmentCode" },
  { sourceHeader: "Öncelik", aliases: ["Öncelik", "Oncelik"], field: "priority" }
] as const;

const OPTIONAL_HEADER_MAPPINGS = [
  {
    sourceHeader: "Profil kodu",
    aliases: ["Profil kodu", "Profil Kodu", "Ana profil kodu", "Ana Profil Kodu"],
    field: "mainProfileCode" as const
  }
] as const;

const REQUIRED_TEXT_FIELDS = [
  "customerName",
  "orderingPartyCode",
  "customerOrderNumber",
  "customerOrderItemNumber",
  "workOrderNumber",
  "materialCode",
  "materialName",
  "orderUnit",
  "departmentCode",
  "priority"
] as const;

const DEPARTMENT_NAMES: Record<string, string> = {
  "1": "MONTAJ",
  "3": "HELEZON",
  "4": "ABOARD",
  "6": "UYUP",
  "7": "KESİMHANE-UYUP",
  "8": "HELEZON-OTOMASYON"
};

DEPARTMENT_NAMES["7"] = "KESİMHANE-UYUP";

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_DATA_ROWS = 10_000;
/** Stored as unrestricted `text` in DB; parser rejects beyond this to contain abuse. */
export const MAX_MATERIAL_NAME_LENGTH = 4000;
/** Opsiyonel "Profil kodu" kolonundan (optimizasyon eşlemesi için). */
export const MAX_MAIN_PROFILE_CODE_LENGTH = 100;

type RequiredHeaderMapping = (typeof REQUIRED_HEADER_MAPPINGS)[number];
type CoreProductionPlanField = RequiredHeaderMapping["field"];

export type ProductionPlanField = CoreProductionPlanField | "mainProfileCode";

type RequiredTextField = (typeof REQUIRED_TEXT_FIELDS)[number];

type WorksheetHeader = {
  columnIndex: number;
  headerName: string;
};

type SelectedWorksheet = {
  sheetName: string;
  worksheet: WorkSheet;
  headerRowIndex: number;
  rangeStartColumn: number;
  rangeEndColumn: number;
  headers: WorksheetHeader[];
  mappedColumns: Record<string, number>;
};

type ParsedExcelDateCode = {
  y?: number;
  m?: number;
  d?: number;
};

type ParseResult<T> = {
  value: T | null;
  isMissing: boolean;
  error: string | null;
};

export type ProductionPlanRowCandidate = Record<
  CoreProductionPlanField,
  unknown
> & {
  mainProfileCode?: unknown;
};

export type NormalizedProductionPlanRow = {
  rowIndex: number;
  sourceRowJson: Record<string, unknown>;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
};

export type ParsedProductionPlanImport = {
  sheetName: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rows: NormalizedProductionPlanRow[];
};

@Injectable()
export class ProductionPlanImportParser {
  parseWorkbook(
    fileName: string,
    fileBuffer: Buffer
  ): ParsedProductionPlanImport {
    let workbook: WorkBook;

    try {
      workbook = read(fileBuffer, {
        type: "buffer",
        cellDates: true
      });
    } catch {
      throw new BadRequestException(
        `"${fileName}" okunabilir bir .xlsx üretim planı dosyası değil.`
      );
    }

    const selectedWorksheet = this.findSelectedWorksheet(workbook);

    if (!selectedWorksheet) {
      throw new BadRequestException(
        "Yüklenen dosyada Üretim Planı için zorunlu kolonlar bulunamadı."
      );
    }

    const rows = this.parseWorksheetRows(selectedWorksheet);

    if (rows.length === 0) {
      throw new BadRequestException("Üretim planı dosyasında veri satırı bulunamadı.");
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

  normalizePatchedRow(
    candidate: ProductionPlanRowCandidate,
    sourceRowJson: Record<string, unknown>,
    rowIndex: number
  ): NormalizedProductionPlanRow {
    return this.normalizeRow(candidate, sourceRowJson, rowIndex);
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

    const headers: WorksheetHeader[] = [];
    const mappedColumns = {} as Record<string, number>;

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cell = this.getWorksheetCell(worksheet, headerRowIndex, columnIndex);
      const headerName = this.normalizeTextValue(cell);

      if (!headerName) {
        continue;
      }

      headers.push({
        columnIndex,
        headerName
      });

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

    if (!hasAllRequiredHeaders) {
      return null;
    }

    for (const header of headers) {
      const normalizedHeaderName = this.normalizeHeaderName(header.headerName);

      for (const entry of OPTIONAL_HEADER_MAPPINGS) {
        if (
          entry.aliases.some(
            (alias) => this.normalizeHeaderName(alias) === normalizedHeaderName
          ) &&
          mappedColumns[entry.field] === undefined
        ) {
          mappedColumns[entry.field] = header.columnIndex;
        }
      }
    }

    return {
          sheetName,
          worksheet,
          headerRowIndex,
          rangeStartColumn: range.s.c,
          rangeEndColumn: range.e.c,
          headers,
          mappedColumns
        };
  }

  private parseWorksheetRows(
    selectedWorksheet: SelectedWorksheet
  ): NormalizedProductionPlanRow[] {
    const reference = selectedWorksheet.worksheet["!ref"];

    if (!reference) {
      return [];
    }

    const range = utils.decode_range(reference);
    const rows: NormalizedProductionPlanRow[] = [];

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
        continue;
      }

      if (rows.length >= MAX_IMPORT_DATA_ROWS) {
        throw new BadRequestException(
          `Üretim planı dosyası en fazla ${MAX_IMPORT_DATA_ROWS} veri satırı içerebilir.`
        );
      }

      rows.push(
        this.normalizeRow(
          this.buildWorksheetRowCandidate(selectedWorksheet, rowIndex),
          this.buildSourceRowJson(selectedWorksheet, rowIndex),
          rowIndex + 1
        )
      );
    }

    return rows;
  }

  private buildWorksheetRowCandidate(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number
  ): ProductionPlanRowCandidate {
    return {
      weekRaw: this.readMappedCell(selectedWorksheet, rowIndex, "weekRaw"),
      customerName: this.readMappedCell(selectedWorksheet, rowIndex, "customerName"),
      orderingPartyCode: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "orderingPartyCode"
      ),
      customerOrderNumber: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "customerOrderNumber"
      ),
      customerOrderItemNumber: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "customerOrderItemNumber"
      ),
      workOrderNumber: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "workOrderNumber"
      ),
      materialCode: this.readMappedCell(selectedWorksheet, rowIndex, "materialCode"),
      materialName: this.readMappedCell(selectedWorksheet, rowIndex, "materialName"),
      quantity: this.readMappedCell(selectedWorksheet, rowIndex, "quantity"),
      orderUnit: this.readMappedCell(selectedWorksheet, rowIndex, "orderUnit"),
      plannedFinishDate: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "plannedFinishDate"
      ),
      departmentCode: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "departmentCode"
      ),
      priority: this.readMappedCell(selectedWorksheet, rowIndex, "priority"),
      mainProfileCode: this.readMappedCell(
        selectedWorksheet,
        rowIndex,
        "mainProfileCode"
      )
    };
  }

  private readMappedCell(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number,
    field: CoreProductionPlanField | "mainProfileCode"
  ): CellObject | undefined {
    const columnIndex = selectedWorksheet.mappedColumns[field];

    if (columnIndex === undefined) {
      return undefined;
    }

    return this.getWorksheetCell(
      selectedWorksheet.worksheet,
      rowIndex,
      columnIndex
    );
  }

  private buildSourceRowJson(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number
  ): Record<string, unknown> {
    const sourceRowJson: Record<string, unknown> = {};

    for (const header of selectedWorksheet.headers) {
      const cell = this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        header.columnIndex
      );

      sourceRowJson[header.headerName] = this.extractSourceJsonValue(cell);
    }

    return sourceRowJson;
  }

  private normalizeRow(
    candidate: ProductionPlanRowCandidate,
    sourceRowJson: Record<string, unknown>,
    rowIndex: number
  ): NormalizedProductionPlanRow {
    const weekRaw = this.normalizeTextValue(candidate.weekRaw);
    const weekNumber = this.parseInteger(weekRaw);
    const customerName = this.normalizeTextValue(candidate.customerName);
    const orderingPartyCode = this.normalizeTextValue(candidate.orderingPartyCode);
    const customerOrderNumber = this.normalizeTextValue(
      candidate.customerOrderNumber
    );
    const customerOrderItemNumber = this.normalizeTextValue(
      candidate.customerOrderItemNumber
    );
    const workOrderNumber = this.normalizeTextValue(candidate.workOrderNumber);
    const materialCode = this.normalizeTextValue(candidate.materialCode);
    const materialName = this.normalizeTextValue(candidate.materialName);
    const mainProfileCodeRaw =
      candidate.mainProfileCode !== undefined &&
      candidate.mainProfileCode !== null
        ? this.normalizeTextValue(candidate.mainProfileCode)
        : null;
    const quantityResult = this.parseQuantity(candidate.quantity);
    const orderUnit = this.normalizeTextValue(candidate.orderUnit);
    const plannedFinishDateResult = this.parsePlannedFinishDate(
      candidate.plannedFinishDate
    );
    const departmentCode = this.normalizeTextValue(candidate.departmentCode);
    const departmentName = this.resolveDepartmentName(departmentCode);
    const priority = this.normalizeTextValue(candidate.priority);
    const priorityLevel = this.parseInteger(priority);
    const validationErrors: string[] = [];

    if (!weekRaw) {
      validationErrors.push("Hafta zorunludur.");
    } else if (weekNumber === null) {
      validationErrors.push("Hafta tam sayı olmalıdır.");
    }

    const requiredTextValues: Record<RequiredTextField, string | null> = {
      customerName,
      orderingPartyCode,
      customerOrderNumber,
      customerOrderItemNumber,
      workOrderNumber,
      materialCode,
      materialName,
      orderUnit,
      departmentCode,
      priority
    };

    for (const field of REQUIRED_TEXT_FIELDS) {
      if (!requiredTextValues[field]) {
        validationErrors.push(`${field} zorunludur.`);
      }
    }

    if (departmentCode && departmentName === null) {
      validationErrors.push(`Bölüm kodu "${departmentCode}" desteklenmiyor.`);
    }

    if (priority && priorityLevel === null) {
      validationErrors.push("Öncelik tam sayı olmalıdır.");
    }

    if (
      materialName !== null &&
      materialName.length > MAX_MATERIAL_NAME_LENGTH
    ) {
      validationErrors.push(
        `Malzeme kısa metni en fazla ${MAX_MATERIAL_NAME_LENGTH} karakter olabilir.`
      );
    }

    if (
      mainProfileCodeRaw !== null &&
      mainProfileCodeRaw.length > MAX_MAIN_PROFILE_CODE_LENGTH
    ) {
      validationErrors.push(
        `Profil kodu en fazla ${MAX_MAIN_PROFILE_CODE_LENGTH} karakter olabilir.`
      );
    }

    if (quantityResult.isMissing) {
      validationErrors.push("Miktar zorunludur.");
    } else if (quantityResult.error) {
      validationErrors.push(quantityResult.error);
    }

    if (plannedFinishDateResult.isMissing) {
      validationErrors.push("Plnl.bitis zorunludur.");
    } else if (plannedFinishDateResult.error) {
      validationErrors.push(plannedFinishDateResult.error);
    }

    return {
      rowIndex,
      sourceRowJson,
      weekRaw,
      weekNumber,
      customerName,
      orderingPartyCode,
      customerOrderNumber,
      customerOrderItemNumber,
      workOrderNumber,
      materialCode,
      materialName,
      materialColor: this.extractMaterialColor(materialName),
      materialSize:
        this.extractMaterialSize(materialName) ??
        this.extractMaterialSizeFromMaterialCode(materialCode),
      mainProfileCode:
        mainProfileCodeRaw !== null &&
        mainProfileCodeRaw.length <= MAX_MAIN_PROFILE_CODE_LENGTH
          ? mainProfileCodeRaw.trim().toUpperCase()
          : null,
      quantity: quantityResult.value,
      orderUnit,
      plannedFinishDate: plannedFinishDateResult.value,
      departmentCode,
      departmentName,
      priority,
      priorityLevel,
      isValid: validationErrors.length === 0,
      validationErrors
    };
  }

  private parseInteger(value: string | null): number | null {
    if (!value || !/^-?\d+$/.test(value)) {
      return null;
    }

    const parsedValue = Number(value);

    return Number.isInteger(parsedValue) ? parsedValue : null;
  }

  private parseQuantity(value: unknown): ParseResult<number> {
    const rawText = this.normalizeTextValue(value);

    if (!rawText) {
      return {
        value: null,
        isMissing: true,
        error: null
      };
    }

    const quantityNumericText = this.normalizeNumericText(
      this.stripTrailingQuantityUnit(rawText)
    );
    const parsedValue = Number(quantityNumericText);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return {
        value: null,
        isMissing: false,
        error: "Miktar pozitif sayı olmalıdır."
      };
    }

    return {
      value: Number(parsedValue.toFixed(3)),
      isMissing: false,
      error: null
    };
  }

  /**
   * Excel exports often append the unit in the quantity cell (e.g. "304 ADT").
   */
  private stripTrailingQuantityUnit(rawText: string): string {
    return rawText
      .replace(
        /\s+(?:ADT|ADET|adet|Adet|PCE|PCS|pcs|pc|PC|ST|STK|kg|KG|MT|mt)\s*$/iu,
        ""
      )
      .trim();
  }

  private parsePlannedFinishDate(value: unknown): ParseResult<string> {
    if (value === null || value === undefined) {
      return {
        value: null,
        isMissing: true,
        error: null
      };
    }

    if (this.isCellObject(value)) {
      if (value.v instanceof Date) {
        return {
          value: this.formatDate(value.v),
          isMissing: false,
          error: null
        };
      }

      if (typeof value.v === "number") {
        return this.parseExcelSerialDate(value.v);
      }
    }

    if (value instanceof Date) {
      return {
        value: this.formatDate(value),
        isMissing: false,
        error: null
      };
    }

    if (typeof value === "number") {
      return this.parseExcelSerialDate(value);
    }

    const rawText = this.normalizeTextValue(value);

    if (!rawText) {
      return {
        value: null,
        isMissing: true,
        error: null
      };
    }

    const dmyMatch = rawText.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/
    );
    const isoMatch = rawText.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoMatch) {
      return this.parseDateParts(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3])
      );
    }

    if (dmyMatch) {
      return this.parseDateParts(
        Number(dmyMatch[3]),
        Number(dmyMatch[2]),
        Number(dmyMatch[1])
      );
    }

    return {
      value: null,
      isMissing: false,
      error: "Plnl.bitiş geçerli bir tarih olmalıdır."
    };
  }

  private normalizeNumericText(value: string): string {
    const compactValue = value.replace(/\s+/g, "");
    const hasComma = compactValue.includes(",");
    const dotCount = compactValue.split(".").length - 1;

    if (hasComma) {
      return compactValue.replace(/\./g, "").replace(",", ".");
    }

    if (dotCount > 1) {
      return compactValue.replace(/\./g, "");
    }

    return compactValue;
  }

  private parseExcelSerialDate(serialValue: number): ParseResult<string> {
    const parsedDateCode = (
      SSF as {
        parse_date_code(value: number): ParsedExcelDateCode | null;
      }
    ).parse_date_code(serialValue);

    if (!parsedDateCode?.y || !parsedDateCode.m || !parsedDateCode.d) {
      return {
        value: null,
        isMissing: false,
        error: "Plnl.bitiş geçerli bir tarih olmalıdır."
      };
    }

    return this.parseDateParts(parsedDateCode.y, parsedDateCode.m, parsedDateCode.d);
  }

  private parseDateParts(
    year: number,
    month: number,
    day: number
  ): ParseResult<string> {
    const candidateDate = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(candidateDate.getTime()) ||
      candidateDate.getUTCFullYear() !== year ||
      candidateDate.getUTCMonth() !== month - 1 ||
      candidateDate.getUTCDate() !== day
    ) {
      return {
        value: null,
        isMissing: false,
        error: "Plnl.bitiş geçerli bir tarih olmalıdır."
      };
    }

    return {
      value: this.formatDate(candidateDate),
      isMissing: false,
      error: null
    };
  }

  private formatDate(value: Date): string {
    const year = value.getUTCFullYear();
    const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${value.getUTCDate()}`.padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private resolveDepartmentName(departmentCode: string | null): string | null {
    if (!departmentCode) {
      return null;
    }

    return DEPARTMENT_NAMES[departmentCode.trim()] ?? null;
  }

  private extractMaterialColor(materialName: string | null): string | null {
    if (!materialName) {
      return null;
    }

    const colorMatch = materialName.toUpperCase().match(/\b(?:RAL|R)\s*(\d{4})\b/);

    return colorMatch?.[1] ? `RAL${colorMatch[1]}` : null;
  }

  /**
   * ISO paper / foil series markers (A0–A4, B0–B2, F0–F2) plus fixed inch literals.
   * SAP material short text often concatenates digits with the series, e.g. "205A4X2000"
   * where word-boundary-based matching would miss "A4".
   */
  private extractMaterialSize(materialName: string | null): string | null {
    if (!materialName) {
      return null;
    }

    const textOutsideParentheses = materialName
      .toUpperCase()
      .replace(/\([^)]*\)/g, " ");

    const seriesSizeMatch = textOutsideParentheses.match(
      /\b(A[0-4]|B[0-2]|F[0-2])\b/
    );

    if (seriesSizeMatch?.[1]) {
      return seriesSizeMatch[1];
    }

    const gluedSeriesMatch = textOutsideParentheses.match(
      /\d(A[0-4]|B[0-2]|F[0-2])(?![0-9])/
    );

    if (gluedSeriesMatch?.[1]) {
      return gluedSeriesMatch[1];
    }

    const inchSizeMatch = textOutsideParentheses.match(
      /(^|[^A-Z0-9])(\d{1,3})\s*"\s*X\s*(\d{1,3})\s*"(?=$|[^A-Z0-9])/
    );

    if (inchSizeMatch?.[2] && inchSizeMatch[3]) {
      return `${inchSizeMatch[2]}"X${inchSizeMatch[3]}"`;
    }

    const metricSizeMatch = textOutsideParentheses.match(
      /(^|[^A-Z0-9])(\d{2,5})\s*X\s*(\d{2,5})\s*(MM)?(?=$|[^A-Z0-9])/
    );

    if (metricSizeMatch?.[2] && metricSizeMatch[3]) {
      return `${metricSizeMatch[2]}X${metricSizeMatch[3]}${metricSizeMatch[4] ?? ""}`;
    }

    const lengthMatch = textOutsideParentheses.match(
      /(^|[^A-Z0-9])(\d{3,5})\s*MM(?=$|[^A-Z0-9])/
    );

    return lengthMatch?.[2] ? `${lengthMatch[2]}MM` : null;
  }

  /**
   * Fallback when size is not present in the short text but is embedded in the SAP-style
   * material number (e.g. UMBSG205A4X2000).
   */
  private extractMaterialSizeFromMaterialCode(materialCode: string | null): string | null {
    if (!materialCode) {
      return null;
    }

    const upper = this.normalizeTextValue(materialCode);

    if (!upper) {
      return null;
    }

    const compact = upper.replace(/\u00A0/g, " ").trim().toUpperCase();
    const gluedSeriesMatch = compact.match(
      /\d(A[0-4]|B[0-2]|F[0-2])(?![0-9])/
    );

    return gluedSeriesMatch?.[1] ?? null;
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

    if (value instanceof Date) {
      return this.formatDate(value);
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim();

      return trimmedValue === "" ? null : trimmedValue;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? `${value}` : null;
    }

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    return null;
  }

  private extractSourceJsonValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (this.isCellObject(value)) {
      if (typeof value.w === "string" && value.w.trim() !== "") {
        return value.w.trim();
      }

      return this.extractSourceJsonValue(value.v);
    }

    if (value instanceof Date) {
      return this.formatDate(value);
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
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
    return worksheet[utils.encode_cell({ r: rowIndex, c: columnIndex })] as
      | CellObject
      | undefined;
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
