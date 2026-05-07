import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EntityFact = {
  label: string;
  value: ReactNode;
};

type EntitySummaryCardProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  facts?: EntityFact[];
  actions?: ReactNode;
  className?: string;
};

export function EntitySummaryCard({
  actions,
  className,
  description,
  eyebrow,
  facts,
  status,
  title
}: EntitySummaryCardProps) {
  return (
    <Card className={cn("overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      <CardContent className="grid gap-4 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-normal text-primary">
                {eyebrow}
              </p>
            ) : null}
            <h3 className="mt-1 truncate text-base font-semibold text-foreground">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {status ? <div className="shrink-0">{status}</div> : null}
        </div>
        {facts?.length ? (
          <dl className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <div
                className="rounded-md border bg-muted/40 px-3 py-2"
                key={fact.label}
              >
                <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {fact.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
