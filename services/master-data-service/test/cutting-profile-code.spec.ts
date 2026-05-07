import { cuttingCodeBelongsToProfile } from "@lemnixpro/shared-contracts";
import { describe, expect, it } from "vitest";

describe("cuttingCodeBelongsToProfile", () => {
  it("accepts exact match and PROFILE-SUFFIX form", () => {
    expect(cuttingCodeBelongsToProfile("1000327P010", "1000327P010")).toBe(true);
    expect(
      cuttingCodeBelongsToProfile("1000327P010", "1000327P010-2020867")
    ).toBe(true);
  });

  it("rejects another profile prefix", () => {
    expect(
      cuttingCodeBelongsToProfile("1000327P010", "1001129P020-2020912")
    ).toBe(false);
  });
});