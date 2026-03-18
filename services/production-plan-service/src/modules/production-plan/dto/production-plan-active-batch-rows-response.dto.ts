import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { ProductionPlanImportBatchResponseDto } from "./production-plan-import-batch-response.dto";

export class ProductionPlanActiveBatchRowResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  rowIndex!: number;

  @ApiPropertyOptional({
    nullable: true
  })
  weekRaw!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  weekNumber!: number | null;

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

  @ApiPropertyOptional({
    nullable: true
  })
  materialCode!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  materialName!: string | null;

  @ApiPropertyOptional({
    nullable: true
  })
  quantity!: number | null;

  @ApiPropertyOptional({
    nullable: true
  })
  orderUnit!: string | null;

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

  @ApiProperty()
  isValid!: boolean;

  @ApiProperty({
    type: [String]
  })
  validationErrors!: string[];
}

export class ProductionPlanActiveBatchRowsResponseDto {
  @ApiProperty({
    type: () => ProductionPlanImportBatchResponseDto
  })
  batch!: ProductionPlanImportBatchResponseDto;

  @ApiProperty({
    type: () => [ProductionPlanActiveBatchRowResponseDto]
  })
  rows!: ProductionPlanActiveBatchRowResponseDto[];
}
