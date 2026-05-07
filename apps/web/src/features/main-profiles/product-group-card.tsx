"use client";

import { useState } from "react";
import type { MainProfile } from "@lemnixpro/shared-contracts";
import { Boxes, ChevronDown, Edit3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/ui/status-badge";

export type ProductGroup = {
  productCode: string;
  productName: string;
  profiles: MainProfile[];
};

export function ProductGroupCard({
  group,
  onEdit
}: {
  group: ProductGroup;
  onEdit: () => void;
}) {
  const [profilesOpen, setProfilesOpen] = useState(false);
  const isActive = group.profiles.some((profile) => profile.isActive);
  const cuttingSpecCount = group.profiles.reduce(
    (total, profile) => total + profile.cuttingSpecs.length,
    0
  );

  return (
    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <CardContent className="grid gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-primary">
              {group.productCode}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-foreground">
              {group.productName}
            </h2>
          </div>
          <StatusBadge tone={isActive ? "success" : "neutral"}>
            {isActive ? "Aktif" : "Pasif"}
          </StatusBadge>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <Fact label="Profil" value={group.profiles.length} />
          <Fact label="Kesim" value={cuttingSpecCount} />
        </dl>

        <div className="overflow-hidden rounded-md border bg-muted/30">
          <button
            aria-expanded={profilesOpen}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            onClick={() => setProfilesOpen((current) => !current)}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <Boxes className="size-4 text-primary" />
              Profil tipleri
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              {group.profiles.length} profil
              <ChevronDown
                aria-hidden="true"
                className={`size-3.5 transition-transform motion-reduce:transition-none ${
                  profilesOpen ? "rotate-180" : "rotate-0"
                }`}
              />
            </span>
          </button>
          {profilesOpen ? (
            <div className="grid gap-2 border-t p-3">
              {group.profiles.map((profile) => (
                <div
                  className="grid gap-1 rounded-md border bg-card px-3 py-2 text-sm"
                  key={profile.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{profile.code}</strong>
                    <StatusBadge tone={profile.isActive ? "success" : "neutral"}>
                      {profile.isActive ? "Aktif" : "Pasif"}
                    </StatusBadge>
                  </div>
                  <span className="text-muted-foreground">{profile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {profile.stockLengthMm} mm stok ·{" "}
                    {profile.cuttingSpecs.length} kesim
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            aria-label="Ürünü düzenle"
            onClick={onEdit}
            size="icon"
            type="button"
            variant="outline"
          >
            <Edit3 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/35 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
