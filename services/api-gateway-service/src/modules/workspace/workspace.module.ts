import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { WorkspaceController } from "./workspace.controller";
import { WorkspaceOverviewService } from "./workspace-overview.service";

@Module({
  controllers: [WorkspaceController],
  imports: [HttpInfrastructureModule],
  providers: [WorkspaceOverviewService]
})
export class WorkspaceModule {}
