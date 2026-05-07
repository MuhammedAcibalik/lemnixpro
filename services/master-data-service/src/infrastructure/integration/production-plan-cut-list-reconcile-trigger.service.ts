import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requestHeaders } from "@lemnixpro/shared-contracts";

/**
 * Notifies production-plan-service to enqueue cut-list reconcile outbox rows for all
 * eligible active batches (same path as row PATCH). Master-data stays the source of truth
 * for profiles; this keeps cut-list matching in sync without user edits.
 */
@Injectable()
export class ProductionPlanCutListReconcileTriggerService {
  private readonly logger = new Logger(
    ProductionPlanCutListReconcileTriggerService.name
  );

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  /** Fire-and-forget; failures are logged only (user mutation already succeeded). */
  requestReconcileSoon(): void {
    void this.invoke().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Cut-list reconcile trigger failed (${detail}). Snapshots may stay stale until the next production-plan row change.`
      );
    });
  }

  private async invoke(): Promise<void> {
    const baseUrl =
      this.configService.get<string>("PRODUCTION_PLAN_SERVICE_BASE_URL")?.trim() ??
      "";

    if (baseUrl === "") {
      return;
    }

    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const url = `${trimmedBase}/internal/production-plan/triggers/cut-list-reconcile-active-batches`;
    const secret =
      this.configService.get<string>("INTERNAL_SERVICE_AUTH_SECRET")?.trim() ?? "";

    const headers = new Headers({
      Accept: "application/json"
    });

    if (secret !== "") {
      headers.set(requestHeaders.internalServiceToken, secret);
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`
      );
    }
  }
}
