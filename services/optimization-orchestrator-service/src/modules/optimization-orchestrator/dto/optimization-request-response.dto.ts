import { ApiProperty } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger";

import {
  optimizationRequestStatuses,
  type OptimizationRequestSummary
} from "@lemnixpro/shared-contracts";

import {
  OptimizationRequestPayloadDto,
  OptimizationUnmatchedSummaryDto
} from "./optimization-dry-run-response.dto";

export class OptimizationRequestSummaryDto implements OptimizationRequestSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  weekNumber!: number;

  @ApiProperty()
  sourceBatchId!: string;

  @ApiProperty({
    enum: optimizationRequestStatuses
  })
  status!: (typeof optimizationRequestStatuses)[number];

  @ApiProperty()
  matchedRows!: number;

  @ApiProperty()
  unmatchedRows!: number;

  @ApiPropertyOptional({
    nullable: true
  })
  queuedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class CreateOptimizationRequestResponseDto {
  @ApiProperty({
    type: () => OptimizationRequestSummaryDto
  })
  request!: OptimizationRequestSummaryDto;

  @ApiProperty({
    type: () => OptimizationRequestPayloadDto
  })
  payloadPreview!: OptimizationRequestPayloadDto;

  @ApiProperty({
    type: () => OptimizationUnmatchedSummaryDto
  })
  unmatchedSummary!: OptimizationUnmatchedSummaryDto;
}

export class OptimizationRequestPreparationFailedResponseDto extends CreateOptimizationRequestResponseDto {
  @ApiProperty()
  message!: string;
}

export class OptimizationRequestDetailResponseDto {
  @ApiProperty({
    type: () => OptimizationRequestSummaryDto
  })
  request!: OptimizationRequestSummaryDto;

  @ApiProperty({
    type: () => OptimizationRequestPayloadDto
  })
  payloadPreview!: OptimizationRequestPayloadDto;
}
