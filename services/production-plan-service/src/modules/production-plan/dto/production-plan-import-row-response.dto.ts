import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProductionPlanImportRowResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  batchId!: string;

  @ApiProperty()
  rowIndex!: number;

  @ApiProperty({
    type: Object,
    additionalProperties: true
  })
  sourceRowJson!: Record<string, unknown>;

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

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
