import { ApiProperty } from "@nestjs/swagger";

import type {
  OptimizationDryRunResponseV2,
  OptimizationProfileGroup,
  OptimizationRequestPayloadV2
} from "@lemnixpro/shared-contracts";

export class OptimizationDryRunV2ResponseDto
  implements OptimizationDryRunResponseV2
{
  @ApiProperty({ type: String })
  cutListSnapshotId!: string;

  @ApiProperty({ type: Number })
  planYear!: number;

  @ApiProperty({ type: Number })
  weekNumber!: number;

  @ApiProperty({ type: Number })
  totalDemandItems!: number;

  @ApiProperty({ type: Number })
  totalProfileGroups!: number;

  @ApiProperty({ type: Number })
  totalCuttingPieces!: number;

  @ApiProperty({ type: Number })
  totalProductivePieceLengthMm!: number;

  @ApiProperty({ type: Object, isArray: true })
  profileGroups!: OptimizationProfileGroup[];

  @ApiProperty({ type: Object })
  preview!: OptimizationRequestPayloadV2;
}
