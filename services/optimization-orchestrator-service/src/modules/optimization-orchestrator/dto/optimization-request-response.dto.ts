import { ApiProperty } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger";

import {
  type CreateOptimizationRequestResponse,
  type OptimizationRequestDetailResponse,
  type OptimizationRequestPreparationFailedResponse,
  type OptimizationRequestRequeueRejectedResponse,
  type OptimizationRequestRequeueResponse,
  optimizationRequestStatuses,
  type OptimizationRequestSummary
} from "@lemnixpro/shared-contracts";

import {
  OptimizationRequestPayloadDto,
  OptimizationUnmatchedSummaryDto
} from "./optimization-dry-run-response.dto";

export class OptimizationRequestSummaryDto implements OptimizationRequestSummary {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Number })
  weekNumber!: number;

  @ApiProperty({ type: String })
  sourceBatchId!: string;

  @ApiProperty({
    type: String,
    enum: optimizationRequestStatuses
  })
  status!: (typeof optimizationRequestStatuses)[number];

  @ApiProperty({ type: Number })
  matchedRows!: number;

  @ApiProperty({ type: Number })
  unmatchedRows!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  queuedAt!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class CreateOptimizationRequestResponseDto
  implements CreateOptimizationRequestResponse
{
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

export class OptimizationRequestPreparationFailedResponseDto
  extends CreateOptimizationRequestResponseDto
  implements OptimizationRequestPreparationFailedResponse
{
  @ApiProperty({ type: String })
  message!: string;
}

export class OptimizationRequestDetailResponseDto
  implements OptimizationRequestDetailResponse
{
  @ApiProperty({
    type: () => OptimizationRequestSummaryDto
  })
  request!: OptimizationRequestSummaryDto;

  @ApiProperty({
    type: () => OptimizationRequestPayloadDto
  })
  payloadPreview!: OptimizationRequestPayloadDto;
}

export class OptimizationRequestRequeueResponseDto
  implements OptimizationRequestRequeueResponse
{
  @ApiProperty({
    type: () => OptimizationRequestSummaryDto
  })
  request!: OptimizationRequestSummaryDto;

  @ApiProperty({ type: String })
  message!: string;
}

export class OptimizationRequestRequeueRejectedResponseDto
  implements OptimizationRequestRequeueRejectedResponse
{
  @ApiProperty({
    type: () => OptimizationRequestSummaryDto
  })
  request!: OptimizationRequestSummaryDto;

  @ApiProperty({ type: String })
  message!: string;
}
