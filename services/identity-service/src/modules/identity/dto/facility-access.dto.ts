import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from "class-validator";

import {
  facilityAccessDecisionReasons,
  facilityAccessRoles,
  facilityModuleKeys,
  facilityScopes,
  type ActiveFacilityContext,
  type FacilityAccessCheckRequest,
  type FacilityAccessCheckResponse,
  type FacilityAccessDecisionReason,
  type FacilityAccessRole,
  type FacilityModuleKey,
  type SetUserFacilityGrantsRequest,
  type UserFacilityAccessResponse,
  type UserFacilityGrant,
  type UserFacilityGrantInput
} from "@lemnixpro/shared-contracts";
import { userRoles, type UserRole } from "@lemnixpro/shared-types";

function normalizeTrimmedString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UserFacilityGrantInputDto implements UserFacilityGrantInput {
  @ApiProperty({ example: "facility-izmir" })
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  facilityId!: string;

  @ApiProperty({ enum: facilityAccessRoles })
  @IsIn(facilityAccessRoles)
  facilityRole!: FacilityAccessRole;

  @ApiProperty({
    enum: facilityModuleKeys,
    isArray: true
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(facilityModuleKeys, { each: true })
  moduleKeys!: FacilityModuleKey[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetUserFacilityGrantsRequestDto
  implements SetUserFacilityGrantsRequest
{
  @ApiProperty({
    type: UserFacilityGrantInputDto,
    isArray: true
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserFacilityGrantInputDto)
  grants!: UserFacilityGrantInputDto[];
}

export class UserFacilityGrantResponseDto implements UserFacilityGrant {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  facilityId!: string;

  @ApiProperty({ enum: facilityAccessRoles })
  facilityRole!: FacilityAccessRole;

  @ApiProperty({
    enum: facilityModuleKeys,
    isArray: true
  })
  moduleKeys!: FacilityModuleKey[];

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class UserFacilityAccessResponseDto
  implements UserFacilityAccessResponse
{
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: userRoles })
  effectiveRole!: UserRole;

  @ApiProperty()
  canUseAllFacilities!: boolean;

  @ApiPropertyOptional({
    nullable: true
  })
  defaultFacilityId!: string | null;

  @ApiProperty({
    type: UserFacilityGrantResponseDto,
    isArray: true
  })
  grants!: UserFacilityGrantResponseDto[];
}

export class FacilityAccessCheckRequestDto
  implements FacilityAccessCheckRequest
{
  @ApiProperty({ enum: facilityScopes })
  @IsIn(facilityScopes)
  scope!: FacilityAccessCheckRequest["scope"];

  @ApiPropertyOptional({
    nullable: true
  })
  @IsOptional()
  @Transform(({ value }) => normalizeTrimmedString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  facilityId?: string | null;

  @ApiPropertyOptional({ enum: facilityModuleKeys })
  @IsOptional()
  @IsIn(facilityModuleKeys)
  moduleKey?: FacilityModuleKey;
}

export class FacilityAccessCheckResponseDto
  implements FacilityAccessCheckResponse
{
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  allowed!: boolean;

  @ApiProperty({ enum: facilityAccessDecisionReasons })
  reason!: FacilityAccessDecisionReason;

  @ApiPropertyOptional({
    nullable: true
  })
  context!: ActiveFacilityContext | null;
}
