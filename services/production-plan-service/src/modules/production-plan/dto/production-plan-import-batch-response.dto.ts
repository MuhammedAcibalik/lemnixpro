import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { productionPlanImportBatchStatuses } from "../../../infrastructure/db/schema";

export class ProductionPlanImportBatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  sheetName!: string;

  @ApiPropertyOptional({
    nullable: true
  })
  weekNumber!: number | null;

  @ApiProperty({
    enum: productionPlanImportBatchStatuses
  })
  status!: string;

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
