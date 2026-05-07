import { ApiProperty } from "@nestjs/swagger";

import { AuthenticatedUserDto } from "./login-response.dto";

export class ProtectedPingResponseDto {
  @ApiProperty({
    type: String,
    example: "Protected gateway route is authenticated."
  })
  message!: string;

  @ApiProperty({
    type: AuthenticatedUserDto
  })
  user!: AuthenticatedUserDto;
}
