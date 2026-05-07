import { ApiProperty } from "@nestjs/swagger";

import type { Facility, FacilityStatus } from "@lemnixpro/shared-contracts";

export class FacilityResponseDto implements Facility {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "IZM-01" })
  code!: string;

  @ApiProperty({ example: "Izmir Production Plant" })
  name!: string;

  @ApiProperty({ enum: ["active", "inactive"] })
  status!: FacilityStatus;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}
