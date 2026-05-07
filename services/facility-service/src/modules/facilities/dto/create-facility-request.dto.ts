import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import {
  facilityStatuses,
  type CreateFacilityRequest,
  type FacilityStatus
} from "@lemnixpro/shared-contracts";

function normalizeTrimmedString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeCode(value: unknown): unknown {
  const normalizedValue = normalizeTrimmedString(value);

  return typeof normalizedValue === "string"
    ? normalizedValue.toUpperCase()
    : normalizedValue;
}

export class CreateFacilityRequestDto implements CreateFacilityRequest {
  @ApiProperty({ example: "IZM-01" })
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: "Izmir Production Plant" })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    enum: facilityStatuses,
    default: "active"
  })
  @IsOptional()
  @IsIn(facilityStatuses)
  status?: FacilityStatus;
}
