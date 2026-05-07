import { PartialType } from "@nestjs/swagger";

import type { UpdateMainProfileRequest } from "@lemnixpro/shared-contracts";

import { CreateMainProfileRequestDto } from "./create-main-profile-request.dto";

export class UpdateMainProfileRequestDto extends PartialType(
  CreateMainProfileRequestDto
) implements UpdateMainProfileRequest {}
