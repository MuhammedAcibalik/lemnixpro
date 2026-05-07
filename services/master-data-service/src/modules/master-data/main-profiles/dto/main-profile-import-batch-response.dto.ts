import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  MainProfileImportBatch,
  MainProfileImportInvalidReasonCount,
  MainProfileImportInvalidRow
} from "@lemnixpro/shared-contracts";

export class MainProfileImportInvalidRowDto
  implements MainProfileImportInvalidRow
{
  @ApiProperty({ type: Number })
  rowIndex!: number;

  @ApiProperty({ nullable: true, type: String })
  productCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  profileCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  cuttingCode!: string | null;

  @ApiProperty({ isArray: true, type: String })
  validationErrors!: string[];
}

export class MainProfileImportInvalidReasonCountDto
  implements MainProfileImportInvalidReasonCount
{
  @ApiProperty({ type: String })
  reason!: string;

  @ApiProperty({ type: Number })
  count!: number;
}

export class MainProfileImportBatchResponseDto
  implements MainProfileImportBatch
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  facilityId!: string;

  @ApiProperty({ type: String })
  fileName!: string;

  @ApiProperty({ type: String })
  sheetName!: string;

  @ApiProperty({ type: Number })
  totalRowCount!: number;

  @ApiProperty({ type: Number })
  validRowCount!: number;

  @ApiProperty({ type: Number })
  invalidRowCount!: number;

  @ApiProperty({ type: Number })
  importedProfileCount!: number;

  @ApiProperty({ type: Number })
  importedCuttingSpecCount!: number;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiPropertyOptional({
    isArray: true,
    type: MainProfileImportInvalidRowDto
  })
  invalidRows?: MainProfileImportInvalidRowDto[];

  @ApiPropertyOptional({
    isArray: true,
    type: MainProfileImportInvalidReasonCountDto
  })
  invalidReasonCounts?: MainProfileImportInvalidReasonCountDto[];
}
