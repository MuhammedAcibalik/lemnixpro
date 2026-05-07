import type {
  AmqpConnectionManager,
  Channel,
  ChannelWrapper
} from "amqp-connection-manager";
import { connect } from "amqp-connection-manager";
import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  messagingExchanges,
  routingKeys,
  type MessageMetadata,
  type OptimizationCompletedMessage,
  type OptimizationFailedMessage,
  type OptimizationQueueEnvelope,
  type OptimizationRequestPayloadV2,
  type OptimizationStartedMessageV2
} from "@lemnixpro/shared-contracts";

export type OptimizationQueueEnvelopeV2 = {
  metadata: MessageMetadata;
  requestId: string;
  cutListSnapshotId: string;
  planYear: number;
  weekNumber: number;
  payload: OptimizationRequestPayloadV2;
  queuedAt: string;
};

type RabbitConsumeMessage = {
  content: Buffer;
};

type RabbitConsumerChannel = Channel & {
  consume(
    queue: string,
    handler: (message: RabbitConsumeMessage | null) => Promise<void>
  ): Promise<unknown>;
  ack(message: RabbitConsumeMessage): void;
  nack(message: RabbitConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
};

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private connection: AmqpConnectionManager | null = null;
  private publisherChannel: ChannelWrapper | null = null;
  private lifecycleConsumerChannel: ChannelWrapper | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async publish(
    envelope: OptimizationQueueEnvelope | OptimizationQueueEnvelopeV2
  ): Promise<void> {
    const bindings = this.getOptimizationBindings();
    const publishOptions = {
      contentType: "application/json",
      contentEncoding: "utf-8",
      persistent: true,
      messageId: envelope.metadata.messageId,
      correlationId: envelope.metadata.correlationId,
      timestamp: Date.parse(envelope.queuedAt)
    } as Parameters<ChannelWrapper["publish"]>[3];

    await this.getPublisherChannel().publish(
      bindings.exchange,
      bindings.requestedKey,
      Buffer.from(JSON.stringify(envelope)),
      publishOptions
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.lifecycleConsumerChannel?.close();
    await this.publisherChannel?.close();
    await this.connection?.close();
  }

  consumeOptimizationLifecycleEvents(handler: {
    started: (message: OptimizationStartedMessageV2) => Promise<void>;
    completed: (message: OptimizationCompletedMessage) => Promise<void>;
    failed: (message: OptimizationFailedMessage) => Promise<void>;
  }): void {
    if (this.lifecycleConsumerChannel) {
      return;
    }

    const bindings = this.getOptimizationBindings();
    this.lifecycleConsumerChannel = this.getConnection().createChannel({
      setup: async (channel: Channel) => {
        await channel.assertExchange(bindings.exchange, "topic", {
          durable: true
        });
        await channel.assertExchange(bindings.deadLetterExchange, "topic", {
          durable: true
        });

        await this.setupLifecycleConsumer(channel, {
          queue: bindings.orchestratorStartedQueue,
          deadLetterQueue: `${bindings.orchestratorStartedQueue}.dlq`,
          routingKey: bindings.startedKey,
          handler: async (payload) =>
            handler.started(payload as OptimizationStartedMessageV2)
        });
        await this.setupLifecycleConsumer(channel, {
          queue: bindings.orchestratorCompletedQueue,
          deadLetterQueue: `${bindings.orchestratorCompletedQueue}.dlq`,
          routingKey: bindings.completedKey,
          handler: async (payload) =>
            handler.completed(payload as OptimizationCompletedMessage)
        });
        await this.setupLifecycleConsumer(channel, {
          queue: bindings.orchestratorFailedQueue,
          deadLetterQueue: `${bindings.orchestratorFailedQueue}.dlq`,
          routingKey: bindings.failedKey,
          handler: async (payload) =>
            handler.failed(payload as OptimizationFailedMessage)
        });
      }
    });
  }

  private getConnectionUrl(): string {
    return this.configService.getOrThrow<string>("RABBITMQ_URL");
  }

  private getOptimizationRequestQueue(): string {
    return this.configService.getOrThrow<string>("OPTIMIZATION_REQUEST_QUEUE");
  }

  private getOptimizationBindings() {
    return {
      exchange: messagingExchanges.optimization,
      requestedKey: this.assertRuntimeString(
        "routingKeys.optimizationRequested",
        routingKeys.optimizationRequested
      ),
      startedKey: this.assertRuntimeString(
        "routingKeys.optimizationStarted",
        routingKeys.optimizationStarted
      ),
      completedKey: this.assertRuntimeString(
        "routingKeys.optimizationCompleted",
        routingKeys.optimizationCompleted
      ),
      failedKey: this.assertRuntimeString(
        "routingKeys.optimizationFailed",
        routingKeys.optimizationFailed
      ),
      retryExchange: this.configService.get<string>(
        "RABBITMQ_RETRY_EXCHANGE",
        "optimization.retry.exchange"
      ),
      deadLetterExchange: this.configService.get<string>(
        "RABBITMQ_DEAD_LETTER_EXCHANGE",
        "optimization.dlx"
      ),
      retryQueue: this.configService.get<string>(
        "OPTIMIZATION_REQUEST_RETRY_QUEUE",
        "optimization.requests.retry"
      ),
      deadLetterQueue: this.configService.get<string>(
        "OPTIMIZATION_REQUEST_DEAD_LETTER_QUEUE",
        "optimization.requests.dlq"
      ),
      retryDelayMs: this.configService.get<number>(
        "RABBITMQ_RETRY_DELAY_MS",
        30_000
      ),
      orchestratorStartedQueue: this.configService.get<string>(
        "OPTIMIZATION_ORCHESTRATOR_STARTED_QUEUE",
        "optimization.orchestrator.started"
      ),
      orchestratorCompletedQueue: this.configService.get<string>(
        "OPTIMIZATION_ORCHESTRATOR_COMPLETED_QUEUE",
        "optimization.orchestrator.completed"
      ),
      orchestratorFailedQueue: this.configService.get<string>(
        "OPTIMIZATION_ORCHESTRATOR_FAILED_QUEUE",
        "optimization.orchestrator.failed"
      )
    };
  }

  private assertRuntimeString(name: string, value: unknown): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `Missing RabbitMQ binding value "${name}". Rebuild @lemnixpro/shared-contracts before starting services.`
      );
    }

    return value;
  }

  private async setupLifecycleConsumer(
    channel: Channel,
    options: {
      queue: string;
      deadLetterQueue: string;
      routingKey: string;
      handler: (payload: unknown) => Promise<void>;
    }
  ): Promise<void> {
    const bindings = this.getOptimizationBindings();
    const consumerChannel = channel as RabbitConsumerChannel;
    await consumerChannel.assertQueue(options.queue, {
      durable: true,
      deadLetterExchange: bindings.deadLetterExchange,
      deadLetterRoutingKey: `${options.routingKey}.poison`
    });
    await consumerChannel.assertQueue(options.deadLetterQueue, {
      durable: true
    });
    await consumerChannel.bindQueue(
      options.queue,
      bindings.exchange,
      options.routingKey
    );
    await consumerChannel.bindQueue(
      options.deadLetterQueue,
      bindings.deadLetterExchange,
      `${options.routingKey}.poison`
    );
    await consumerChannel.consume(
      options.queue,
      async (message: RabbitConsumeMessage | null) => {
        if (!message) {
          return;
        }

        try {
          await options.handler(JSON.parse(message.content.toString("utf8")));
          consumerChannel.ack(message);
        } catch {
          consumerChannel.nack(message, false, false);
        }
      }
    );
  }

  private getPublisherChannel(): ChannelWrapper {
    if (!this.publisherChannel) {
      const bindings = this.getOptimizationBindings();
      const queueName = this.getOptimizationRequestQueue();

      this.publisherChannel = this.getConnection().createChannel({
        setup: async (channel: Channel) => {
          await channel.assertExchange(bindings.exchange, "topic", {
            durable: true
          });
          await channel.assertExchange(bindings.retryExchange, "topic", {
            durable: true
          });
          await channel.assertExchange(bindings.deadLetterExchange, "topic", {
            durable: true
          });
          await channel.assertQueue(queueName, {
            durable: true,
            deadLetterExchange: bindings.retryExchange,
            deadLetterRoutingKey: bindings.requestedKey
          });
          await channel.assertQueue(bindings.retryQueue, {
            durable: true,
            deadLetterExchange: bindings.exchange,
            deadLetterRoutingKey: bindings.requestedKey,
            messageTtl: bindings.retryDelayMs
          });
          await channel.assertQueue(bindings.deadLetterQueue, {
            durable: true
          });
          await channel.bindQueue(
            queueName,
            bindings.exchange,
            bindings.requestedKey
          );
          await channel.bindQueue(
            bindings.retryQueue,
            bindings.retryExchange,
            bindings.requestedKey
          );
          await channel.bindQueue(
            bindings.deadLetterQueue,
            bindings.deadLetterExchange,
            `${bindings.requestedKey}.poison`
          );
        }
      });
    }

    return this.publisherChannel;
  }

  private getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      this.connection = connect([this.getConnectionUrl()]);
    }

    return this.connection;
  }
}
