import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

import type { CreateOptimizationRequestRequest } from "@lemnixpro/shared-contracts";

export class CreateOptimizationRequestDto
  implements CreateOptimizationRequestRequest
{
  @ApiProperty({
    example: 12
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNumber!: number;
}
