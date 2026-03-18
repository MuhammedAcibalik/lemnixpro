import type { OptimizationQueueEnvelope } from "@lemnixpro/shared-contracts";

export const OPTIMIZATION_REQUEST_QUEUE_PUBLISHER = Symbol(
  "OPTIMIZATION_REQUEST_QUEUE_PUBLISHER"
);

export interface OptimizationRequestQueuePublisher {
  publish(envelope: OptimizationQueueEnvelope): Promise<void>;
}
