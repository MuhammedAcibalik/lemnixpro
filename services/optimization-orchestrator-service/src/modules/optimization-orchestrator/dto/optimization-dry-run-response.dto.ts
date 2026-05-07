import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  OptimizationDryRunActiveBatchSummary,
  OptimizationDemandRow,
  OptimizationMainProfileInput,
  OptimizationDryRunResponse,
  OptimizationPreparationUnmatchedRow,
  OptimizationRequestPayload
} from "@lemnixpro/shared-contracts";

export const optimizationPreparationUnmatchedReasonCodes = [
  "production_row_invalid",
  "missing_material_code",
  "missing_active_main_profile",
  "ambiguous_active_main_profile",
  "main_profile_code_unmatched"
] as const;

export type OptimizationPreparationUnmatchedReasonCode =
  (typeof optimizationPreparationUnmatchedReasonCodes)[number];

export class OptimizationDryRunActiveBatchSummaryDto
  implements OptimizationDryRunActiveBatchSummary
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  fileName!: string;

  @ApiProperty({ type: String })
  sheetName!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  planYear!: number | null;

  @ApiProperty({ type: Number })
  weekNumber!: number;

  @ApiProperty({ type: String, enum: ["active"] })
  status!: "active";

  @ApiProperty({ type: Number })
  totalRowCount!: number;

  @ApiProperty({ type: Number })
  validRowCount!: number;

  @ApiProperty({ type: Number })
  invalidRowCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class OptimizationPreparationUnmatchedRowDto
  implements OptimizationPreparationUnmatchedRow
{
  @ApiProperty({ type: String })
  rowId!: string;

  @ApiProperty({ type: Number })
  rowIndex!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  materialCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  workOrderNumber!: string | null;

  @ApiProperty({
    type: String,
    enum: optimizationPreparationUnmatchedReasonCodes,
    isArray: true
  })
  reasons!: OptimizationPreparationUnmatchedReasonCode[];

  @ApiProperty({
    type: [String]
  })
  details!: string[];
}

export class OptimizationMainProfileInputDto
  implements OptimizationMainProfileInput
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  linkedProductCode!: string;

  @ApiProperty({ type: String })
  linkedProductName!: string;

  @ApiProperty({ type: Number })
  stockLengthMm!: number;
}

export class OptimizationDemandRowDto implements OptimizationDemandRow {
  @ApiProperty({ type: String })
  productionRowId!: string;

  @ApiProperty({ type: Number })
  rowIndex!: number;

  @ApiProperty({ type: String })
  mainProfileId!: string;

  @ApiProperty({ type: String })
  mainProfileCode!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  customerName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  orderingPartyCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  customerOrderNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  customerOrderItemNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  workOrderNumber!: string | null;

  @ApiProperty({ type: String })
  materialCode!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  materialName!: string | null;

  @ApiProperty({ type: Number })
  quantity!: number;

  @ApiProperty({ type: String })
  orderUnit!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  plannedFinishDate!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  departmentCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  priority!: string | null;
}

export class OptimizationRequestPayloadDto implements OptimizationRequestPayload {
  @ApiProperty({ type: Number })
  weekNumber!: number;

  @ApiProperty({ type: String })
  sourceBatchId!: string;

  @ApiProperty({
    type: () => [OptimizationMainProfileInputDto]
  })
  mainProfiles!: OptimizationMainProfileInputDto[];

  @ApiProperty({
    type: () => [OptimizationDemandRowDto]
  })
  demandRows!: OptimizationDemandRowDto[];
}

export class OptimizationUnmatchedSummaryDto {
  @ApiProperty({ type: Number })
  totalUnmatchedRows!: number;

  @ApiProperty({ type: Number })
  rowsMissingMasterDataLinkage!: number;

  @ApiProperty({
    type: () => [OptimizationPreparationUnmatchedRowDto]
  })
  unmatchedReasons!: OptimizationPreparationUnmatchedRowDto[];
}

export class OptimizationDryRunResponseDto implements OptimizationDryRunResponse {
  @ApiProperty({ type: Number })
  weekNumber!: number;

  @ApiProperty({
    type: () => OptimizationDryRunActiveBatchSummaryDto
  })
  activeBatch!: OptimizationDryRunActiveBatchSummaryDto;

  @ApiProperty({ type: Number })
  totalProductionRows!: number;

  @ApiProperty({ type: Number })
  masterDataCountUsed!: number;

  @ApiProperty({ type: Number })
  matchedRows!: number;

  @ApiProperty({ type: Number })
  unmatchedRows!: number;

  @ApiProperty({ type: Number })
  rowsMissingMasterDataLinkage!: number;

  @ApiProperty({
    type: () => [OptimizationPreparationUnmatchedRowDto]
  })
  unmatchedReasons!: OptimizationPreparationUnmatchedRowDto[];

  @ApiProperty({
    type: () => OptimizationRequestPayloadDto
  })
  optimizationRequestPreview!: OptimizationRequestPayloadDto;
}
