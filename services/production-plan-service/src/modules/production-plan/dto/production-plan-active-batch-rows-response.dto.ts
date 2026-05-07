import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  ProductionPlanActiveBatchRow,
  ProductionPlanActiveBatchRowsResponse
} from "@lemnixpro/shared-contracts";

import { ProductionPlanImportBatchResponseDto } from "./production-plan-import-batch-response.dto";

export class ProductionPlanActiveBatchRowResponseDto
  implements ProductionPlanActiveBatchRow
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  facilityId!: string;

  @ApiProperty({ type: Number })
  rowIndex!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  weekRaw!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  weekNumber!: number | null;

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

  @ApiPropertyOptional({ type: String, nullable: true })
  materialCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  materialName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  materialColor!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  materialSize!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mainProfileCode!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  quantity!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  orderUnit!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  plannedFinishDate!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  departmentCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  departmentName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  priority!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  priorityLevel!: number | null;

  @ApiProperty({ type: Boolean })
  isValid!: boolean;

  @ApiProperty({
    type: [String]
  })
  validationErrors!: string[];
}

export class ProductionPlanActiveBatchRowsResponseDto
  implements ProductionPlanActiveBatchRowsResponse
{
  @ApiProperty({
    type: () => ProductionPlanImportBatchResponseDto
  })
  batch!: ProductionPlanImportBatchResponseDto;

  @ApiProperty({
    type: () => [ProductionPlanActiveBatchRowResponseDto]
  })
  rows!: ProductionPlanActiveBatchRowResponseDto[];
}
