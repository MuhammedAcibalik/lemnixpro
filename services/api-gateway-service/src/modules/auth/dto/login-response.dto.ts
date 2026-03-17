import { ApiProperty } from "@nestjs/swagger";

import type { AuthenticatedUser, LoginResponse } from "@lemnixpro/shared-contracts";
import { userRoles } from "@lemnixpro/shared-types";

export class AuthenticatedUserDto implements AuthenticatedUser {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({
    enum: userRoles
  })
  role!: (typeof userRoles)[number];

  @ApiProperty()
  isActive!: boolean;
}

export class LoginResponseDto implements LoginResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({
    enum: ["Bearer"]
  })
  tokenType!: "Bearer";

  @ApiProperty({
    example: "8h"
  })
  expiresIn!: string;

  @ApiProperty({
    type: AuthenticatedUserDto
  })
  user!: AuthenticatedUserDto;
}
