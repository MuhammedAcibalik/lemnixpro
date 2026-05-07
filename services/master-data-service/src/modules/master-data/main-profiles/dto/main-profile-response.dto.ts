import { ApiProperty } from "@nestjs/swagger";

import type {
  MainProfile,
  MainProfileCuttingSpec
} from "@lemnixpro/shared-contracts";

class MainProfileCuttingSpecResponseDto implements MainProfileCuttingSpec {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  cuttingCode!: string;

  @ApiProperty({ type: String })
  cuttingName!: string;

  @ApiProperty({ type: Number })
  cuttingLengthMm!: number;

  @ApiProperty({ type: Number })
  unitQuantity!: number;

  @ApiProperty({ type: String })
  unitName!: string;
}

export class MainProfileResponseDto implements MainProfile {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  facilityId!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({
    example: 6500,
    type: Number
  })
  stockLengthMm!: number;

  @ApiProperty({ type: String })
  linkedProductCode!: string;

  @ApiProperty({ type: String })
  linkedProductName!: string;

  @ApiProperty({ isArray: true, type: MainProfileCuttingSpecResponseDto })
  cuttingSpecs!: MainProfileCuttingSpec[];

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({
    nullable: true,
    required: false,
    type: String
  })
  notes!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}
