import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  OptimizationDemandRow,
  OptimizationMainProfileInput,
  OptimizationRequestPayload
} from "@lemnixpro/shared-contracts";

export const optimizationPreparationUnmatchedReasonCodes = [
  "production_row_invalid",
  "missing_material_code",
  "missing_active_main_profile",
  "ambiguous_active_main_profile"
] as const;

export type OptimizationPreparationUnmatchedReasonCode =
  (typeof optimizationPreparationUnmatchedReasonCodes)[number];

export class OptimizationDryRunActiveBatchSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  sheetName!: string;

  @ApiProperty()
  weekNumber!: number;

  @ApiProperty()
  status!: "active";

  @ApiProperty()
  totalRowCount!: number;

  @ApiProperty()
  validRowCount!: number;

  @ApiProperty()
  invalidRowCount!: number;

  @ApiPropertyOptional({
    nullable: true
  })
  activatedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OptimizationPreparationUnmatchedRowDto {
  @ApiProperty()
  rowId!: string;

  @ApiProperty()
  rowIndex!: number;

  @ApiPropertyOptional({
    nullable: true
  })
  materialCode!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  workOrderNumber!: string | null;

  @ApiProperty({
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
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  linkedProductCode!: string;

  @ApiProperty()
  linkedProductName!: string;

  @ApiProperty()
  stockLengthMm!: number;
}

export class OptimizationDemandRowDto implements OptimizationDemandRow {
  @ApiProperty()
  productionRowId!: string;

  @ApiProperty()
  rowIndex!: number;

  @ApiProperty()
  mainProfileId!: string;

  @ApiProperty()
  mainProfileCode!: string;

  @ApiPropertyOptional({
    nullable: true
  })
  customerName!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  orderingPartyCode!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  customerOrderNumber!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  customerOrderItemNumber!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  workOrderNumber!: string | null;

  @ApiProperty()
  materialCode!: string;

  @ApiPropertyOptional({
    nullable: true
  })
  materialName!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  orderUnit!: string;

  @ApiPropertyOptional({
    nullable: true
  })
  plannedFinishDate!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  departmentCode!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  priority!: string | null;
}

export class OptimizationRequestPayloadDto implements OptimizationRequestPayload {
  @ApiProperty()
  weekNumber!: number;

  @ApiProperty()
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
  @ApiProperty()
  totalUnmatchedRows!: number;

  @ApiProperty()
  rowsMissingMasterDataLinkage!: number;

  @ApiProperty({
    type: () => [OptimizationPreparationUnmatchedRowDto]
  })
  unmatchedReasons!: OptimizationPreparationUnmatchedRowDto[];
}

export class OptimizationDryRunResponseDto {
  @ApiProperty()
  weekNumber!: number;

  @ApiProperty({
    type: () => OptimizationDryRunActiveBatchSummaryDto
  })
  activeBatch!: OptimizationDryRunActiveBatchSummaryDto;

  @ApiProperty()
  totalProductionRows!: number;

  @ApiProperty()
  masterDataCountUsed!: number;

  @ApiProperty()
  matchedRows!: number;

  @ApiProperty()
  unmatchedRows!: number;

  @ApiProperty()
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
