import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

import type { LoginRequest } from "@lemnixpro/shared-contracts";

export class LoginRequestDto implements LoginRequest {
  @ApiProperty({
    example: "admin@example.com"
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: "StrongPassword123!"
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
