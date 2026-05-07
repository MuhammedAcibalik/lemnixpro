import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  ProductionPlanImportBatch,
  ProductionPlanImportBatchStatus
} from "@lemnixpro/shared-contracts";

import { productionPlanImportBatchStatuses } from "../../../infrastructure/db/schema";

export class ProductionPlanImportBatchResponseDto
  implements ProductionPlanImportBatch
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  facilityId!: string;

  @ApiProperty({ type: String })
  fileName!: string;

  @ApiProperty({ type: String })
  sheetName!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  planYear!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  weekNumber!: number | null;

  @ApiProperty({
    enum: productionPlanImportBatchStatuses
  })
  status!: ProductionPlanImportBatchStatus;

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
