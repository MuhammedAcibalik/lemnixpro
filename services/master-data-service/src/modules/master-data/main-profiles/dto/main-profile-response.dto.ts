import { ApiProperty } from "@nestjs/swagger";

export class MainProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    example: 6500
  })
  stockLengthMm!: number;

  @ApiProperty()
  linkedProductCode!: string;

  @ApiProperty()
  linkedProductName!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    nullable: true,
    required: false
  })
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
