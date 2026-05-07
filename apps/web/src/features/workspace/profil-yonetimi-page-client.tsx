"use client";

import type { MainProfile } from "@lemnixpro/shared-contracts";
import { useQuery } from "@tanstack/react-query";

import {
  ProfileManagementClient
} from "@/features/main-profiles/profile-management-client";
import type { ProductGroup } from "@/features/main-profiles/product-group-card";
import { workspaceQueries } from "@/lib/workspace-query";
import { CompactDataSkeleton } from "@/ui/compact-data-skeleton";
import { EmptyState } from "@/ui/empty-state";

export function ProfilYonetimiPageClient() {
  const profilesQuery = useQuery(workspaceQueries.mainProfiles());

  if (profilesQuery.isError && !profilesQuery.data) {
    return (
      <EmptyState
        description={profilesQuery.error.message}
        title="Profil verisi alınamadı"
      />
    );
  }

  if (profilesQuery.isLoading && !profilesQuery.data) {
    return <CompactDataSkeleton rows={4} />;
  }

  return (
    <ProfileManagementClient
      isFetching={profilesQuery.isFetching}
      productGroups={groupProfilesByProduct(profilesQuery.data ?? [])}
    />
  );
}

function groupProfilesByProduct(profiles: MainProfile[]): ProductGroup[] {
  const groupsByProductCode = new Map<string, ProductGroup>();

  for (const profile of profiles) {
    const productCode = profile.linkedProductCode;
    const existingGroup = groupsByProductCode.get(productCode);

    if (existingGroup) {
      existingGroup.profiles.push(profile);
      continue;
    }

    groupsByProductCode.set(productCode, {
      productCode,
      productName: profile.linkedProductName,
      profiles: [profile]
    });
  }

  return [...groupsByProductCode.values()].sort((left, right) =>
    left.productCode.localeCompare(right.productCode, "tr")
  );
}
