import type {
  AmqpConnectionManager,
  ChannelWrapper
} from "amqp-connection-manager";
import { connect } from "amqp-connection-manager";
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  messagingExchanges,
  routingKeys,
  type ProductionPlanBatchActivatedEvent,
  type ProductionPlanBatchCutListReconcileEvent
} from "@lemnixpro/shared-contracts";

type RabbitConsumeMessage = {
  content: Buffer;
  properties?: {
    headers?: Record<string, unknown>;
  };
};

type RabbitSetupChannel = {
  assertExchange(
    exchange: string,
    type: string,
    options: { durable: boolean }
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options: {
      durable: boolean;
      deadLetterExchange?: string;
      deadLetterRoutingKey?: string;
      messageTtl?: number;
    }
  ): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  consume(
    queue: string,
    handler: (message: RabbitConsumeMessage | null) => Promise<void>
  ): Promise<unknown>;
  ack(message: RabbitConsumeMessage): void;
  nack(message: RabbitConsumeMessage, allUpTo: boolean, requeue: boolean): void;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: {
      persistent: boolean;
      contentType: string;
      contentEncoding: string;
    }
  ): boolean;
};

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: AmqpConnectionManager | null = null;
  private readonly consumerChannels: ChannelWrapper[] = [];
  private readonly startedConsumers = new Set<string>();

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  consumeProductionPlanBatchActivated(
    handler: (event: ProductionPlanBatchActivatedEvent) => Promise<void>
  ): void {
    this.consumeFromProductionPlanExchange({
      consumerKey: "batch-activated",
      routingKey: routingKeys.productionPlanBatchActivated,
      queue: this.configService.get<string>(
        "CUT_LIST_BATCH_ACTIVATED_QUEUE",
        "cut-list.production-plan.batch-activated"
      ),
      retryQueue: this.configService.get<string>(
        "CUT_LIST_BATCH_ACTIVATED_RETRY_QUEUE",
        "cut-list.production-plan.batch-activated.retry"
      ),
      deadLetterQueue: this.configService.get<string>(
        "CUT_LIST_BATCH_ACTIVATED_DEAD_LETTER_QUEUE",
        "cut-list.production-plan.batch-activated.dlq"
      ),
      logLabel: "batch-activated",
      parse: (raw) => JSON.parse(raw) as ProductionPlanBatchActivatedEvent,
      handler
    });
  }

  consumeProductionPlanCutListReconcile(
    handler: (event: ProductionPlanBatchCutListReconcileEvent) => Promise<void>
  ): void {
    this.consumeFromProductionPlanExchange({
      consumerKey: "cut-list-reconcile",
      routingKey: routingKeys.productionPlanBatchCutListReconcile,
      queue: this.configService.get<string>(
        "CUT_LIST_BATCH_RECONCILE_QUEUE",
        "cut-list.production-plan.batch-cut-list-reconcile.v2"
      ),
      retryQueue: this.configService.get<string>(
        "CUT_LIST_BATCH_RECONCILE_RETRY_QUEUE",
        "cut-list.production-plan.batch-cut-list-reconcile.v2.retry"
      ),
      deadLetterQueue: this.configService.get<string>(
        "CUT_LIST_BATCH_RECONCILE_DEAD_LETTER_QUEUE",
        "cut-list.production-plan.batch-cut-list-reconcile.v2.dlq"
      ),
      logLabel: "cut-list-reconcile",
      parse: (raw) => JSON.parse(raw) as ProductionPlanBatchCutListReconcileEvent,
      handler
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.consumerChannels.map((channel) => channel.close()));
    this.consumerChannels.length = 0;
    await this.connection?.close();
  }

  private consumeFromProductionPlanExchange<T>(options: {
    consumerKey: string;
    routingKey: string;
    queue: string;
    retryQueue: string;
    deadLetterQueue: string;
    logLabel: string;
    parse: (raw: string) => T;
    handler: (event: T) => Promise<void>;
  }): void {
    if (this.startedConsumers.has(options.consumerKey)) {
      return;
    }

    this.startedConsumers.add(options.consumerKey);

    const exchange = messagingExchanges.productionPlan;
    const retryExchange = this.configService.get<string>(
      "CUT_LIST_RETRY_EXCHANGE",
      "cut-list.retry.exchange"
    );
    const deadLetterExchange = this.configService.get<string>(
      "CUT_LIST_DEAD_LETTER_EXCHANGE",
      "cut-list.dlx"
    );
    const retryDelayMs = this.configService.get<number>("RABBITMQ_RETRY_DELAY_MS", 30000);
    const maxAttempts = this.configService.get<number>("RABBITMQ_MAX_ATTEMPTS", 5);

    const channelWrapper = this.getConnection().createChannel({
      setup: async (channel: RabbitSetupChannel) => {
        await channel.assertExchange(exchange, "topic", {
          durable: true
        });
        await channel.assertExchange(retryExchange, "topic", {
          durable: true
        });
        await channel.assertExchange(deadLetterExchange, "topic", {
          durable: true
        });
        await channel.assertQueue(options.queue, {
          durable: true,
          deadLetterExchange: retryExchange,
          deadLetterRoutingKey: options.routingKey
        });
        await channel.assertQueue(options.retryQueue, {
          durable: true,
          deadLetterExchange: exchange,
          deadLetterRoutingKey: options.routingKey,
          messageTtl: retryDelayMs
        });
        await channel.assertQueue(options.deadLetterQueue, {
          durable: true
        });
        await channel.bindQueue(options.queue, exchange, options.routingKey);
        await channel.bindQueue(options.retryQueue, retryExchange, options.routingKey);
        await channel.bindQueue(
          options.deadLetterQueue,
          deadLetterExchange,
          `${options.routingKey}.poison`
        );
        await channel.consume(options.queue, async (message: RabbitConsumeMessage | null) => {
          if (!message) {
            return;
          }

          try {
            const payload = options.parse(message.content.toString("utf8"));
            await options.handler(payload);
            channel.ack(message);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const nextAttempt = this.getRetryCount(message) + 1;
            if (nextAttempt >= maxAttempts) {
              this.logger.error(
                `Production-plan ${options.logLabel} message sent to DLQ after ${maxAttempts} attempts: ${detail}`
              );
              channel.publish(
                deadLetterExchange,
                `${options.routingKey}.poison`,
                message.content,
                {
                  persistent: true,
                  contentType: "application/json",
                  contentEncoding: "utf-8"
                }
              );
              channel.ack(message);
              return;
            }

            this.logger.warn(
              `Production-plan ${options.logLabel} handler failed (attempt ${nextAttempt}/${maxAttempts}): ${detail}`
            );
            channel.nack(message, false, false);
          }
        });
      }
    });

    this.consumerChannels.push(channelWrapper);
  }

  private getRetryCount(message: RabbitConsumeMessage): number {
    const deaths = message.properties?.headers?.["x-death"];

    if (!Array.isArray(deaths)) {
      return 0;
    }

    return (deaths as unknown[]).reduce<number>((total, death) => {
      if (
        typeof death === "object" &&
        death !== null &&
        typeof (death as { count?: unknown }).count === "number"
      ) {
        return total + (death as { count: number }).count;
      }

      return total;
    }, 0);
  }

  private getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      this.connection = connect([
        this.configService.getOrThrow<string>("RABBITMQ_URL")
      ]);
    }

    return this.connection;
  }
}
