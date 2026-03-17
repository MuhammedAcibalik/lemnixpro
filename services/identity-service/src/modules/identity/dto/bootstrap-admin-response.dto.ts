import { ApiProperty } from "@nestjs/swagger";

import type { CurrentUserResponse } from "@lemnixpro/shared-contracts";

import { AuthenticatedUserDto } from "./login-response.dto";

export class BootstrapAdminResponseDto implements CurrentUserResponse {
  @ApiProperty({
    type: AuthenticatedUserDto
  })
  user!: AuthenticatedUserDto;
}
