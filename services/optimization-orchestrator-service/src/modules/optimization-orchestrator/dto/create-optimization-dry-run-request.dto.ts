import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class CreateOptimizationDryRunRequestDto {
  @ApiProperty({
    example: 12
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekNumber!: number;
}
