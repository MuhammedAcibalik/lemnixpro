import "server-only";

import type {
  CutListSnapshotDetail,
  CutListSnapshotSummary
} from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

export function listCutListSnapshots(): Promise<CutListSnapshotSummary[]> {
  return requestGatewayWithSession<CutListSnapshotSummary[]>("/cut-lists");
}

export function getCutListSnapshot(id: string): Promise<CutListSnapshotDetail> {
  return requestGatewayWithSession<CutListSnapshotDetail>(`/cut-lists/${id}`);
}

export function getLatestCutListSnapshot(
  weekNumber: number
): Promise<CutListSnapshotDetail> {
  return requestGatewayWithSession<CutListSnapshotDetail>(
    `/cut-lists/weeks/${weekNumber}/latest`
  );
}

export function getLatestCutListSnapshotByYear(
  planYear: number,
  weekNumber: number
): Promise<CutListSnapshotDetail> {
  return requestGatewayWithSession<CutListSnapshotDetail>(
    `/cut-lists/years/${planYear}/weeks/${weekNumber}/latest`
  );
}

export function createCutListSnapshot(
  weekNumber: number
): Promise<CutListSnapshotDetail> {
  return requestGatewayWithSession<CutListSnapshotDetail>(
    `/cut-lists/weeks/${weekNumber}/snapshots`,
    {
      method: "POST"
    }
  );
}
