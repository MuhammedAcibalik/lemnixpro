import { ApiProperty } from "@nestjs/swagger";

import type { AuthenticatedUser, LoginResponse } from "@lemnixpro/shared-contracts";
import { userRoles } from "@lemnixpro/shared-types";

export class AuthenticatedUserDto implements AuthenticatedUser {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String })
  fullName!: string;

  @ApiProperty({
    type: String,
    enum: userRoles
  })
  role!: (typeof userRoles)[number];

  @ApiProperty({ type: Boolean })
  isActive!: boolean;
}

export class LoginResponseDto implements LoginResponse {
  @ApiProperty({ type: String })
  accessToken!: string;

  @ApiProperty({
    type: String,
    enum: ["Bearer"]
  })
  tokenType!: "Bearer";

  @ApiProperty({
    type: String,
    example: "8h"
  })
  expiresIn!: string;

  @ApiProperty({
    type: AuthenticatedUserDto
  })
  user!: AuthenticatedUserDto;
}
