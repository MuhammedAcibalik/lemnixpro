import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "@lemnixpro/shared-types";

export const ROLES_KEY = "lemnixpro:roles";

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
