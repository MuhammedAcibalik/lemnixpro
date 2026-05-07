import type { ProductionPlanImportBatchDetail } from "@lemnixpro/shared-contracts";

import { ProductionPlanImportBatchResponseDto } from "./production-plan-import-batch-response.dto";

export class ProductionPlanImportBatchDetailResponseDto
  extends ProductionPlanImportBatchResponseDto
  implements ProductionPlanImportBatchDetail {}
