CREATE TABLE IF NOT EXISTS production_plan.production_plan_outbox_events (
  id uuid PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS production_plan_outbox_events_status_next_attempt_idx
ON production_plan.production_plan_outbox_events (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS production_plan_outbox_events_aggregate_idx
ON production_plan.production_plan_outbox_events (aggregate_id);
