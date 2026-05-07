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

export class GatewayOptimizationStockBarDto implements OptimizationStockBar {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  lengthMm!: number;

  @ApiProperty({ enum: ["primary", "secondary"] })
  @IsIn(["primary", "secondary"])
  role!: OptimizationStockBarRole;
}

export class GatewayOptimizationProfileGroupOverrideDto
  implements OptimizationProfileGroupOverride
{
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mainProfileId!: string;

  @ApiProperty({
    type: () => GatewayOptimizationStockBarDto,
    isArray: true
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GatewayOptimizationStockBarDto)
  stockBars!: GatewayOptimizationStockBarDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  displayCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class GatewayOptimizationConfigDto implements OptimizationConfig {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  kerfMm!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  minReusableScrapMm!: number;

  @ApiProperty()
  @IsBoolean()
  allowMixingStockBars!: boolean;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  solverTimeLimitSec!: number;

  @ApiProperty()
  @IsInt()
  randomSeed!: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minProfileEfficiencyPct!: number | null;

  @ApiProperty()
  @IsBoolean()
  patternConsolidationEnabled!: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDistinctPatternsPerProfile!: number | null;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  patternQualityToleranceMm!: number;

  @ApiProperty({ required: false, nullable: true })
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
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cutListSnapshotId!: string;

  @ApiProperty({
    description: 'Either "ALL" or an explicit list of work order numbers.',
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
  })
  selectedWorkOrderNumbers!: string[] | "ALL";

  @ApiProperty({
    type: () => GatewayOptimizationProfileGroupOverrideDto,
    isArray: true
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GatewayOptimizationProfileGroupOverrideDto)
  overrides!: GatewayOptimizationProfileGroupOverrideDto[];

  @ApiProperty({ type: () => GatewayOptimizationConfigDto })
  @ValidateNested()
  @Type(() => GatewayOptimizationConfigDto)
  config!: GatewayOptimizationConfigDto;
}
