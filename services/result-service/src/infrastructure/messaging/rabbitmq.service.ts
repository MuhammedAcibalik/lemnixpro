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
  type OptimizationCompletedMessage,
  type OptimizationFailedMessage
} from "@lemnixpro/shared-contracts";

type RabbitConsumeMessage = {
  content: Buffer;
};

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private connection: AmqpConnectionManager | null = null;
  private consumerChannel: ChannelWrapper | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getConnectionUrl(): string {
    return this.configService.getOrThrow<string>("RABBITMQ_URL");
  }

  getResultBindings() {
    return {
      exchange: messagingExchanges.optimization,
      completedKey: routingKeys.optimizationCompleted,
      failedKey: routingKeys.optimizationFailed,
      deadLetterExchange: this.configService.get<string>(
        "RABBITMQ_DEAD_LETTER_EXCHANGE",
        "optimization.dlx"
      ),
      completedDeadLetterQueue: this.configService.get<string>(
        "OPTIMIZATION_RESULTS_COMPLETED_DEAD_LETTER_QUEUE",
        "optimization.results.completed.dlq"
      ),
      failedDeadLetterQueue: this.configService.get<string>(
        "OPTIMIZATION_RESULTS_FAILED_DEAD_LETTER_QUEUE",
        "optimization.results.failed.dlq"
      )
    };
  }

  consumeResultEvents(handler: {
    completed: (message: OptimizationCompletedMessage) => Promise<void>;
    failed: (message: OptimizationFailedMessage) => Promise<void>;
  }): void {
    if (this.consumerChannel) {
      return;
    }

    const bindings = this.getResultBindings();

    this.consumerChannel = this.getConnection().createChannel({
      setup: async (channel: Channel) => {
        await channel.assertExchange(bindings.exchange, "topic", {
          durable: true
        });
        await channel.assertExchange(bindings.deadLetterExchange, "topic", {
          durable: true
        });
        await channel.assertQueue(bindings.completedDeadLetterQueue, {
          durable: true
        });
        await channel.assertQueue(bindings.failedDeadLetterQueue, {
          durable: true
        });
        await channel.bindQueue(
          bindings.completedDeadLetterQueue,
          bindings.deadLetterExchange,
          `${bindings.completedKey}.poison`
        );
        await channel.bindQueue(
          bindings.failedDeadLetterQueue,
          bindings.deadLetterExchange,
          `${bindings.failedKey}.poison`
        );
        await this.setupQueueConsumer(channel, {
          queue: "optimization.results.completed",
          routingKey: bindings.completedKey,
          handler: async (payload) =>
            handler.completed(payload as OptimizationCompletedMessage)
        });
        await this.setupQueueConsumer(channel, {
          queue: "optimization.results.failed",
          routingKey: bindings.failedKey,
          handler: async (payload) =>
            handler.failed(payload as OptimizationFailedMessage)
        });
      }
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumerChannel?.close();
    await this.connection?.close();
  }

  private async setupQueueConsumer(
    channel: Channel,
    options: {
      queue: string;
      routingKey: string;
      handler: (payload: unknown) => Promise<void>;
    }
  ): Promise<void> {
    const bindings = this.getResultBindings();

    await channel.assertQueue(options.queue, {
      durable: true,
      deadLetterExchange: bindings.deadLetterExchange,
      deadLetterRoutingKey: `${options.routingKey}.poison`
    });
    await channel.bindQueue(options.queue, bindings.exchange, options.routingKey);
    await channel.consume(options.queue, async (message: RabbitConsumeMessage | null) => {
      if (!message) {
        return;
      }

      try {
        await options.handler(JSON.parse(message.content.toString("utf8")));
        channel.ack(message);
      } catch {
        channel.nack(message, false, false);
      }
    });
  }

  private getConnection(): AmqpConnectionManager {
    if (!this.connection) {
      this.connection = connect([this.getConnectionUrl()]);
    }

    return this.connection;
  }
}
