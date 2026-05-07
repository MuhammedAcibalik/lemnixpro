declare module "amqplib" {
  export namespace Options {
    export type AssertExchange = Record<string, unknown>;
    export type AssertQueue = Record<string, unknown>;
    export type Consume = Record<string, unknown>;
    export type DeleteExchange = Record<string, unknown>;
    export type DeleteQueue = Record<string, unknown>;
    export type Get = Record<string, unknown>;
    export type Publish = Record<string, unknown>;
  }

  export namespace Replies {
    export type AssertExchange = Record<string, unknown>;
    export type AssertQueue = Record<string, unknown>;
    export type Consume = {
      consumerTag: string;
    };
    export type DeleteQueue = Record<string, unknown>;
    export type Empty = Record<string, never>;
    export type PurgeQueue = Record<string, unknown>;
  }

  export type Message = {
    content: Buffer;
  };

  export type ConsumeMessage = Message & {
    fields: {
      consumerTag: string;
    };
  };

  export type GetMessage = Message;

  export interface Channel {
    assertExchange(
      exchange: string,
      type: string,
      options?: Options.AssertExchange
    ): Promise<Replies.AssertExchange>;
    assertQueue(
      queue: string,
      options?: Options.AssertQueue
    ): Promise<Replies.AssertQueue>;
    bindQueue(
      queue: string,
      source: string,
      pattern: string,
      args?: unknown
    ): Promise<void>;
  }

  export interface ConfirmChannel extends Channel {}
}
