import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type { WorkspaceOverviewResponse } from "@lemnixpro/shared-contracts";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";

import { WorkspaceOverviewService } from "./workspace-overview.service";

@ApiTags("workspace")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workspace")
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceOverviewService)
    private readonly workspaceOverviewService: WorkspaceOverviewService
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Aggregated workspace overview for fast UI hydration." })
  @ApiOkResponse({ description: "Workspace overview returned." })
  async getOverview(): Promise<WorkspaceOverviewResponse> {
    return this.workspaceOverviewService.getOverview();
  }
}
