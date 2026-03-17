import { PartialType } from "@nestjs/swagger";

import { CreateMainProfileRequestDto } from "./create-main-profile-request.dto";

export class UpdateMainProfileRequestDto extends PartialType(
  CreateMainProfileRequestDto
) {}
