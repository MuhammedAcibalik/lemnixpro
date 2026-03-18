import { BadRequestException, Injectable } from "@nestjs/common";
import {
  SSF,
  read,
  utils,
  type CellObject,
  type WorkBook,
  type WorkSheet
} from "xlsx";

const REQUIRED_HEADER_MAPPINGS = [
  { sourceHeader: "Hafta", aliases: ["Hafta"], field: "weekRaw" },
  { sourceHeader: "Ad", aliases: ["Ad"], field: "customerName" },
  {
    sourceHeader: "Sprş.veren",
    aliases: ["Sprş.veren", "Spr?.veren"],
    field: "orderingPartyCode"
  },
  {
    sourceHeader: "Mştr.no.",
    aliases: ["Mştr.no.", "M?tr.no."],
    field: "customerOrderNumber"
  },
  {
    sourceHeader: "Mştr.klm.",
    aliases: ["Mştr.klm.", "M?tr.klm."],
    field: "customerOrderItemNumber"
  },
  {
    sourceHeader: "Sipariş",
    aliases: ["Sipariş", "Sipari?"],
    field: "workOrderNumber"
  },
  {
    sourceHeader: "Malzeme no.",
    aliases: ["Malzeme no."],
    field: "materialCode"
  },
  {
    sourceHeader: "Malzeme kısa metni",
    aliases: ["Malzeme kısa metni", "Malzeme k?sa metni"],
    field: "materialName"
  },
  { sourceHeader: "Miktar", aliases: ["Miktar"], field: "quantity" },
  {
    sourceHeader: "Sprş.ÖB",
    aliases: ["Sprş.ÖB", "Spr?.?B"],
    field: "orderUnit"
  },
  {
    sourceHeader: "Plnl.bitiş",
    aliases: ["Plnl.bitiş", "Plnl.biti?"],
    field: "plannedFinishDate"
  },
  {
    sourceHeader: "Bölüm",
    aliases: ["Bölüm", "B?l?m"],
    field: "departmentCode"
  },
  {
    sourceHeader: "Öncelik",
    aliases: ["Öncelik", "?ncelik"],
    field: "priority"
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

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_DATA_ROWS = 10_000;

type RequiredHeaderMapping = (typeof REQUIRED_HEADER_MAPPINGS)[number];
type ProductionPlanField = RequiredHeaderMapping["field"];
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
  mappedColumns: Record<ProductionPlanField, number>;
};

type QuantityParseResult = {
  value: number | null;
  isMissing: boolean;
  error: string | null;
};

type PlannedFinishDateParseResult = {
  value: string | null;
  isMissing: boolean;
  error: string | null;
};

type ParsedExcelDateCode = {
  y?: number;
  m?: number;
  d?: number;
};

export type ProductionPlanRowCandidate = Record<ProductionPlanField, unknown>;

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
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  priority: string | null;
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
        `The uploaded file "${fileName}" is not a readable .xlsx workbook.`
      );
    }

    const selectedWorksheet = this.findSelectedWorksheet(workbook);

    if (!selectedWorksheet) {
      throw new BadRequestException(
        "The uploaded workbook does not contain the required production plan headers."
      );
    }

    const rows = this.parseWorksheetRows(selectedWorksheet);

    if (rows.length === 0) {
      throw new BadRequestException(
        "The uploaded worksheet does not contain any non-blank data rows."
      );
    }

    const validRowCount = rows.filter((row) => row.isValid).length;
    const invalidRowCount = rows.length - validRowCount;

    return {
      sheetName: selectedWorksheet.sheetName,
      totalRowCount: rows.length,
      validRowCount,
      invalidRowCount,
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
    const mappedColumns = {} as Record<ProductionPlanField, number>;

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
          `The uploaded worksheet exceeds the maximum of ${MAX_IMPORT_DATA_ROWS} data rows.`
        );
      }

      const sourceRowJson = this.buildSourceRowJson(selectedWorksheet, rowIndex);
      const candidate = this.buildWorksheetRowCandidate(selectedWorksheet, rowIndex);

      rows.push(this.normalizeRow(candidate, sourceRowJson, rowIndex + 1));
    }

    return rows;
  }

  private buildWorksheetRowCandidate(
    selectedWorksheet: SelectedWorksheet,
    rowIndex: number
  ): ProductionPlanRowCandidate {
    return {
      weekRaw: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.weekRaw
      ),
      customerName: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.customerName
      ),
      orderingPartyCode: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.orderingPartyCode
      ),
      customerOrderNumber: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.customerOrderNumber
      ),
      customerOrderItemNumber: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.customerOrderItemNumber
      ),
      workOrderNumber: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.workOrderNumber
      ),
      materialCode: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.materialCode
      ),
      materialName: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.materialName
      ),
      quantity: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.quantity
      ),
      orderUnit: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.orderUnit
      ),
      plannedFinishDate: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.plannedFinishDate
      ),
      departmentCode: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.departmentCode
      ),
      priority: this.getWorksheetCell(
        selectedWorksheet.worksheet,
        rowIndex,
        selectedWorksheet.mappedColumns.priority
      )
    };
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
    const weekNumber = this.parseWeekNumber(weekRaw);
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
    const quantityResult = this.parseQuantity(candidate.quantity);
    const orderUnit = this.normalizeTextValue(candidate.orderUnit);
    const plannedFinishDateResult = this.parsePlannedFinishDate(
      candidate.plannedFinishDate
    );
    const departmentCode = this.normalizeTextValue(candidate.departmentCode);
    const priority = this.normalizeTextValue(candidate.priority);
    const validationErrors: string[] = [];

    if (!weekRaw) {
      validationErrors.push("weekRaw is required.");
    } else if (weekNumber === null) {
      validationErrors.push("weekRaw must contain an integer week value.");
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
        validationErrors.push(`${field} is required.`);
      }
    }

    if (quantityResult.isMissing) {
      validationErrors.push("quantity is required.");
    } else if (quantityResult.error) {
      validationErrors.push(quantityResult.error);
    }

    if (!plannedFinishDateResult.isMissing && plannedFinishDateResult.error) {
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
      quantity: quantityResult.value,
      orderUnit,
      plannedFinishDate: plannedFinishDateResult.value,
      departmentCode,
      priority,
      isValid: validationErrors.length === 0,
      validationErrors
    };
  }

  private parseWeekNumber(weekRaw: string | null): number | null {
    if (!weekRaw || !/^-?\d+$/.test(weekRaw)) {
      return null;
    }

    const parsedWeekNumber = Number(weekRaw);

    return Number.isInteger(parsedWeekNumber) ? parsedWeekNumber : null;
  }

  private parseQuantity(value: unknown): QuantityParseResult {
    if (value === null || value === undefined) {
      return {
        value: null,
        isMissing: true,
        error: null
      };
    }

    if (this.isCellObject(value) && typeof value.v === "number") {
      return this.finalizeQuantity(value.v);
    }

    if (typeof value === "number") {
      return this.finalizeQuantity(value);
    }

    const rawText = this.normalizeTextValue(value);

    if (!rawText) {
      return {
        value: null,
        isMissing: true,
        error: null
      };
    }

    const compactText = rawText.replace(/\s+/g, "");
    const commaCount = this.countOccurrences(compactText, ",");
    const dotCount = this.countOccurrences(compactText, ".");
    let normalizedNumericText = compactText;

    if (commaCount > 0 && dotCount > 0) {
      const lastCommaIndex = compactText.lastIndexOf(",");
      const lastDotIndex = compactText.lastIndexOf(".");
      const decimalSeparator = lastCommaIndex > lastDotIndex ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";

      normalizedNumericText = compactText.split(groupingSeparator).join("");
      normalizedNumericText =
        decimalSeparator === ","
          ? normalizedNumericText.replace(",", ".")
          : normalizedNumericText;
    } else if (commaCount > 0) {
      if (commaCount > 1) {
        return {
          value: null,
          isMissing: false,
          error: "quantity must be a positive number."
        };
      }

      normalizedNumericText = compactText.replace(",", ".");
    } else if (dotCount > 1) {
      return {
        value: null,
        isMissing: false,
        error: "quantity must be a positive number."
      };
    }

    if (!/^[+-]?\d+(\.\d+)?$/.test(normalizedNumericText)) {
      return {
        value: null,
        isMissing: false,
        error: "quantity must be a positive number."
      };
    }

    return this.finalizeQuantity(Number(normalizedNumericText));
  }

  private finalizeQuantity(quantity: number): QuantityParseResult {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        value: null,
        isMissing: false,
        error: "quantity must be a positive number."
      };
    }

    return {
      value: Number(quantity.toFixed(3)),
      isMissing: false,
      error: null
    };
  }

  private parsePlannedFinishDate(value: unknown): PlannedFinishDateParseResult {
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

    const dottedDateMatch = rawText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (dottedDateMatch) {
      return this.parseDateParts(
        Number(dottedDateMatch[3]),
        Number(dottedDateMatch[2]),
        Number(dottedDateMatch[1])
      );
    }

    const slashedDateMatch = rawText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (slashedDateMatch) {
      return this.parseDateParts(
        Number(slashedDateMatch[3]),
        Number(slashedDateMatch[2]),
        Number(slashedDateMatch[1])
      );
    }

    const isoLikeDateMatch = rawText.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoLikeDateMatch) {
      return this.parseDateParts(
        Number(isoLikeDateMatch[1]),
        Number(isoLikeDateMatch[2]),
        Number(isoLikeDateMatch[3])
      );
    }

    return {
      value: null,
      isMissing: false,
      error: "plannedFinishDate must be a valid date."
    };
  }

  private parseExcelSerialDate(serialValue: number): PlannedFinishDateParseResult {
    const parsedDateCode = (
      SSF as {
        parse_date_code(value: number): ParsedExcelDateCode | null;
      }
    ).parse_date_code(serialValue);

    if (!parsedDateCode?.y || !parsedDateCode.m || !parsedDateCode.d) {
      return {
        value: null,
        isMissing: false,
        error: "plannedFinishDate must be a valid date."
      };
    }

    return this.parseDateParts(parsedDateCode.y, parsedDateCode.m, parsedDateCode.d);
  }

  private parseDateParts(
    year: number,
    month: number,
    day: number
  ): PlannedFinishDateParseResult {
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
        error: "plannedFinishDate must be a valid date."
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
    return value.replace(/\s+/g, " ").trim();
  }

  private countOccurrences(value: string, target: string): number {
    return value.split(target).length - 1;
  }

  private isCellObject(value: unknown): value is CellObject {
    return (
      typeof value === "object" &&
      value !== null &&
      ("v" in value || "w" in value || "t" in value)
    );
  }
}
