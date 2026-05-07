CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS master_data;
CREATE SCHEMA IF NOT EXISTS production_plan;
CREATE SCHEMA IF NOT EXISTS cut_list;
CREATE SCHEMA IF NOT EXISTS optimization;
CREATE SCHEMA IF NOT EXISTS result;

COMMENT ON SCHEMA identity IS 'Owned by identity-service migrations/runtime role.';
COMMENT ON SCHEMA master_data IS 'Owned by master-data-service migrations/runtime role.';
COMMENT ON SCHEMA production_plan IS 'Owned by production-plan-service migrations/runtime role.';
COMMENT ON SCHEMA cut_list IS 'Owned by cut-list-service migrations/runtime role.';
COMMENT ON SCHEMA optimization IS 'Owned by optimization-orchestrator-service migrations/runtime role.';
COMMENT ON SCHEMA result IS 'Owned by result-service migrations/runtime role.';
