import { ApiProperty } from "@nestjs/swagger";

import type { ProductionPlanImportRowsPage } from "@lemnixpro/shared-contracts";

import { ProductionPlanImportRowResponseDto } from "./production-plan-import-row-response.dto";

export class ProductionPlanImportRowsPageResponseDto implements ProductionPlanImportRowsPage {
  @ApiProperty({ type: [ProductionPlanImportRowResponseDto] })
  rows!: ProductionPlanImportRowResponseDto[];

  @ApiProperty({ type: Number })
  totalCount!: number;

  @ApiProperty({ type: Number })
  limit!: number;

  @ApiProperty({ type: Number })
  offset!: number;
}
