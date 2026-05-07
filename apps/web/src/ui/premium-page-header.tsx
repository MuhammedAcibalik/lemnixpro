import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/status";

type HeaderBadge = {
  label: string;
  tone?: StatusTone;
};

const badgeVariantByTone: Record<StatusTone, ComponentProps<typeof Badge>["variant"]> = {
  danger: "destructive",
  info: "info",
  neutral: "neutral",
  planned: "neutral",
  success: "success",
  warning: "warning"
};

type PremiumPageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  badge?: HeaderBadge;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PremiumPageHeader({
  actions,
  badge,
  className,
  description,
  eyebrow,
  meta,
  title
}: PremiumPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-primary">
            {eyebrow}
          </p>
          {badge ? (
            <Badge variant={badgeVariantByTone[badge.tone ?? "neutral"]}>
              {badge.label}
            </Badge>
          ) : null}
        </div>
        <h1 className="max-w-5xl text-balance text-2xl font-semibold tracking-normal text-foreground md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-5xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
