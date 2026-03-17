import { ApiProperty } from "@nestjs/swagger";

import { productionPlanImportBatchStatusValues } from "../production-plan-import.parser";

export class ProductionPlanImportBatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  sheetName!: string;

  @ApiProperty({
    enum: productionPlanImportBatchStatusValues
  })
  status!: string;

  @ApiProperty()
  totalRowCount!: number;

  @ApiProperty()
  validRowCount!: number;

  @ApiProperty()
  invalidRowCount!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
