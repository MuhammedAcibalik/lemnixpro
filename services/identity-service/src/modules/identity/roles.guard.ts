import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import type { JwtClaims } from "@lemnixpro/shared-contracts";
import type { UserRole } from "@lemnixpro/shared-types";

import { ROLES_KEY } from "./roles.decorator";
import { UsersRepository } from "./users.repository";

type AuthenticatedRequest = {
  user?: JwtClaims;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(UsersRepository)
    private readonly usersRepository: UsersRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      (Reflect.getMetadata(
        ROLES_KEY,
        context.getHandler()
      ) as readonly UserRole[] | undefined) ??
      (Reflect.getMetadata(
        ROLES_KEY,
        context.getClass()
      ) as readonly UserRole[] | undefined);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException("Authenticated user is required.");
    }

    const user = await this.usersRepository.findById(request.user.sub);

    if (!user) {
      throw new UnauthorizedException("User not found for token subject.");
    }

    if (!user.isActive) {
      throw new ForbiddenException("User account is inactive.");
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "Authenticated user role is not allowed for this operation."
      );
    }

    return true;
  }
}
