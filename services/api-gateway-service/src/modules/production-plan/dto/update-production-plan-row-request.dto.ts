import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

import type { UpdateProductionPlanRowRequest } from "@lemnixpro/shared-contracts";

function normalizeOptionalScalarInput(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

export class UpdateProductionPlanRowRequestDto
  implements UpdateProductionPlanRowRequest
{
  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderingPartyCode?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerOrderNumber?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerOrderItemNumber?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workOrderNumber?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  materialCode?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  materialName?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(50)
  quantity?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderUnit?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plannedFinishDate?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentCode?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => normalizeOptionalScalarInput(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  priority?: string | null;
}
