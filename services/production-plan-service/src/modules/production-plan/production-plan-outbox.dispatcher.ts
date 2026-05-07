import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  routingKeys,
  type ProductionPlanBatchActivatedEvent,
  type ProductionPlanBatchCutListReconcileEvent
} from "@lemnixpro/shared-contracts";

import { RabbitMqService } from "../../infrastructure/messaging/rabbitmq.service";

import { ProductionPlanImportsRepository } from "./production-plan-imports.repository";

@Injectable()
export class ProductionPlanOutboxDispatcher
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ProductionPlanOutboxDispatcher.name);
  private interval: NodeJS.Timeout | null = null;
  private isDispatching = false;

  constructor(
    @Inject(ProductionPlanImportsRepository)
    private readonly repository: ProductionPlanImportsRepository,
    @Inject(RabbitMqService)
    private readonly rabbitMqService: RabbitMqService,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    if (!this.configService.get<boolean>("PRODUCTION_PLAN_OUTBOX_ENABLED", true)) {
      return;
    }

    const intervalMs = this.configService.get<number>(
      "PRODUCTION_PLAN_OUTBOX_INTERVAL_MS",
      3000
    );

    void this.startAfterBackfill(intervalMs);
  }

  private async startAfterBackfill(intervalMs: number): Promise<void> {
    try {
      const inserted = await this.repository.backfillMissingActivatedOutboxEvents();
      if (inserted > 0) {
        this.logger.log(
          `Backfilled ${inserted} missing production-plan.batch.activated outbox row(s) for already-active batches (cut-list pipeline can process them).`
        );
      }
    } catch (error) {
      this.logger.warn(
        `Production-plan outbox backfill failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    this.interval = setInterval(() => {
      void this.dispatchDueEvents();
    }, intervalMs);
    void this.dispatchDueEvents();
  }

  onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async dispatchDueEvents(): Promise<void> {
    if (this.isDispatching) {
      return;
    }

    this.isDispatching = true;

    try {
      const events = await this.repository.findDueOutboxEvents();

      for (const event of events) {
        try {
          if (event.eventType === routingKeys.productionPlanBatchActivated) {
            const payload =
              event.payloadJson as unknown as ProductionPlanBatchActivatedEvent;
            payload.metadata.attempt = event.attempts + 1;
            await this.rabbitMqService.publishBatchActivated(payload);
            await this.repository.markOutboxEventPublished(event.id);
            continue;
          }

          if (event.eventType === routingKeys.productionPlanBatchCutListReconcile) {
            const payload =
              event.payloadJson as unknown as ProductionPlanBatchCutListReconcileEvent;
            payload.metadata.attempt = event.attempts + 1;
            await this.rabbitMqService.publishCutListReconcile(payload);
            await this.repository.markOutboxEventPublished(event.id);
            continue;
          }

          await this.repository.markOutboxEventFailed(
            event.id,
            event.attempts,
            1,
            0
          );
        } catch (error) {
          await this.repository.markOutboxEventFailed(
            event.id,
            event.attempts,
            this.configService.get<number>("PRODUCTION_PLAN_OUTBOX_MAX_ATTEMPTS", 5),
            this.configService.get<number>(
              "PRODUCTION_PLAN_OUTBOX_RETRY_DELAY_MS",
              30000
            )
          );
          this.logger.warn(
            `Failed to dispatch production-plan outbox event ${event.id}: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Production-plan outbox poll failed (${detail}). ` +
          `If tables are missing, run database migrations from the service folder: ` +
          `pnpm --filter @lemnixpro/production-plan-service db:migrate`
      );
    } finally {
      this.isDispatching = false;
    }
  }
}
