import type { OptimizationQueueEnvelope } from "@lemnixpro/shared-contracts";

import type { OptimizationQueueEnvelopeV2 } from "../../infrastructure/messaging/rabbitmq.service";

export const OPTIMIZATION_REQUEST_QUEUE_PUBLISHER = Symbol(
  "OPTIMIZATION_REQUEST_QUEUE_PUBLISHER"
);

export interface OptimizationRequestQueuePublisher {
  publish(
    envelope: OptimizationQueueEnvelope | OptimizationQueueEnvelopeV2
  ): Promise<void>;
}
