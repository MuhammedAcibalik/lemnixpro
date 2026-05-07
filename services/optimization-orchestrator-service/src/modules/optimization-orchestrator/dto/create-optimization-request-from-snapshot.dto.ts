import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";

import { ApiProperty } from "@nestjs/swagger";

import type {
  CreateOptimizationRequestFromSnapshotRequest,
  OptimizationConfig,
  OptimizationProfileGroupOverride,
  OptimizationStockBar,
  OptimizationStockBarRole
} from "@lemnixpro/shared-contracts";

export class OptimizationStockBarDto implements OptimizationStockBar {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  lengthMm!: number;

  @ApiProperty({ type: String, enum: ["primary", "secondary"] })
  @IsIn(["primary", "secondary"])
  role!: OptimizationStockBarRole;
}

export class OptimizationProfileGroupOverrideDto
  implements OptimizationProfileGroupOverride
{
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  mainProfileId!: string;

  @ApiProperty({ type: () => OptimizationStockBarDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OptimizationStockBarDto)
  stockBars!: OptimizationStockBarDto[];

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  displayCode?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class OptimizationConfigDto implements OptimizationConfig {
  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  kerfMm!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  minReusableScrapMm!: number;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  allowMixingStockBars!: boolean;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  solverTimeLimitSec!: number;

  @ApiProperty({ type: Number })
  @IsInt()
  randomSeed!: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPiecesPerStockBar!: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minProfileEfficiencyPct!: number | null;

  @ApiProperty()
  @IsBoolean()
  patternConsolidationEnabled!: boolean;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDistinctPatternsPerProfile!: number | null;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  patternQualityToleranceMm!: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStockLengthVarietyPerProfile!: number | null;

  @ApiProperty()
  @IsBoolean()
  preferReusableScrap!: boolean;

  @ApiProperty()
  @IsBoolean()
  allowPostRepackPatternIncrease!: boolean;
}

export class CreateOptimizationRequestFromSnapshotDto
  implements CreateOptimizationRequestFromSnapshotRequest
{
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  cutListSnapshotId!: string;

  @ApiProperty({
    description:
      'Either "ALL" or an explicit list of work order numbers to include from the snapshot.',
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
  })
  selectedWorkOrderNumbers!: string[] | "ALL";

  @ApiProperty({ type: () => OptimizationProfileGroupOverrideDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptimizationProfileGroupOverrideDto)
  overrides!: OptimizationProfileGroupOverrideDto[];

  @ApiProperty({ type: () => OptimizationConfigDto })
  @ValidateNested()
  @Type(() => OptimizationConfigDto)
  config!: OptimizationConfigDto;
}
