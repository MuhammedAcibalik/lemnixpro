import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPlanInternalTriggersController } from "../src/modules/production-plan/production-plan-internal-triggers.controller";
import { ProductionPlanImportsService } from "../src/modules/production-plan/production-plan-imports.service";

describe("ProductionPlanInternalTriggersController", () => {
  let app: INestApplication;
  let enqueueCutListReconcileForAllActiveBatches: ReturnType<
    typeof vi.fn
  >;

  beforeEach(async () => {
    enqueueCutListReconcileForAllActiveBatches = vi
      .fn()
      .mockResolvedValue({ enqueuedBatchCount: 2 });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductionPlanInternalTriggersController],
      providers: [
        {
          provide: ProductionPlanImportsService,
          useValue: {
            enqueueCutListReconcileForAllActiveBatches
          }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST cut-list-reconcile-active-batches delegates to imports service", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post(
        "/internal/production-plan/triggers/cut-list-reconcile-active-batches"
      )
      .expect(202);

    expect(response.body).toEqual({ enqueuedBatchCount: 2 });
    expect(enqueueCutListReconcileForAllActiveBatches).toHaveBeenCalledTimes(1);
  });
});
