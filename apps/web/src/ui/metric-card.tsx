import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

type MetricCardProps = {
  label: string;
  value: string;
  meta?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "planned";
  badge?: string;
  children?: ReactNode;
};

const accentByTone: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  danger: "border-l-red-500 bg-red-50/35",
  info: "border-l-blue-500 bg-blue-50/35",
  neutral: "border-l-zinc-300",
  planned: "border-l-zinc-300",
  success: "border-l-emerald-500 bg-emerald-50/35",
  warning: "border-l-amber-500 bg-amber-50/35"
};

export function MetricCard({
  badge,
  children,
  label,
  meta,
  tone = "neutral",
  value
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        "border-l-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        accentByTone[tone]
      )}
    >
      <CardContent className="grid min-h-28 gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            {label}
          </p>
          {badge ? <StatusBadge tone={tone}>{badge}</StatusBadge> : null}
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-normal text-foreground">
          {value}
        </p>
        {meta ? <p className="text-sm leading-5 text-muted-foreground">{meta}</p> : null}
        {children ? <div className="pt-1">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
