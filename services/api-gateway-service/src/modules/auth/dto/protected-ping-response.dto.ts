import { ApiProperty } from "@nestjs/swagger";

import { AuthenticatedUserDto } from "./login-response.dto";

export class ProtectedPingResponseDto {
  @ApiProperty({
    example: "Protected gateway route is authenticated."
  })
  message!: string;

  @ApiProperty({
    type: AuthenticatedUserDto
  })
  user!: AuthenticatedUserDto;
}
