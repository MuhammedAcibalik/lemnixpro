import { ApiProperty } from "@nestjs/swagger";

import type {
  CreateOptimizationRequestFromSnapshotResponse,
  OptimizationRequestPayloadV2,
  OptimizationRequestSummaryV2
} from "@lemnixpro/shared-contracts";

export class CreateOptimizationRequestFromSnapshotResponseDto
  implements CreateOptimizationRequestFromSnapshotResponse
{
  @ApiProperty({ type: Object })
  request!: OptimizationRequestSummaryV2;

  @ApiProperty({ type: Object })
  preview!: OptimizationRequestPayloadV2;
}
