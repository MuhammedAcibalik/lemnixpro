import { PartialType } from "@nestjs/swagger";

import type { UpdateFacilityRequest } from "@lemnixpro/shared-contracts";

import { CreateFacilityRequestDto } from "./create-facility-request.dto";

export class UpdateFacilityRequestDto extends PartialType(
  CreateFacilityRequestDto
) implements UpdateFacilityRequest {}
