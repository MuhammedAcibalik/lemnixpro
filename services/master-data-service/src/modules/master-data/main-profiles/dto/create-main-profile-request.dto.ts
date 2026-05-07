import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

import type {
  CreateMainProfileRequest,
  MainProfileCuttingSpecInput
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

function normalizeOptionalNotes(value: unknown): unknown {
  const normalizedValue = normalizeTrimmedString(value);

  if (normalizedValue === "") {
    return null;
  }

  return normalizedValue;
}

export class MainProfileCuttingSpecInputDto
  implements MainProfileCuttingSpecInput
{
  @ApiProperty({ example: "KS-001" })
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  cuttingCode!: string;

  @ApiProperty({ example: "Alt kayıt düz kesim" })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  cuttingName!: string;

  @ApiProperty({ example: 1240 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cuttingLengthMm!: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  unitQuantity!: number;

  @ApiProperty({ example: "Adet" })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unitName!: string;
}

export class CreateMainProfileRequestDto implements CreateMainProfileRequest {
  @ApiProperty({
    example: "MP-001"
  })
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  @ApiProperty({
    example: "Main Aluminum Profile"
  })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    example: 6500,
    description: "Stock length in millimeters."
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stockLengthMm!: number;

  @ApiProperty({
    example: "PRD-001"
  })
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  linkedProductCode!: string;

  @ApiProperty({
    example: "Window Frame Profile"
  })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  linkedProductName!: string;

  @ApiPropertyOptional({
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    isArray: true,
    type: MainProfileCuttingSpecInputDto
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MainProfileCuttingSpecInputDto)
  cuttingSpecs?: MainProfileCuttingSpecInputDto[];

  @ApiPropertyOptional({
    example: "Preferred supplier lot for standard stock."
  })
  @Transform(({ value }) => normalizeOptionalNotes(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
