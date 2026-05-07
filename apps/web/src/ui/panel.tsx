import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PanelProps = {
  title?: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
};

export function Panel({
  actions,
  children,
  className,
  compact = false,
  description,
  eyebrow,
  title
}: PanelProps) {
  const hasHeader = title || eyebrow || description || actions;

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      {hasHeader ? (
        <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase text-primary">
                {eyebrow}
              </p>
            ) : null}
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? (
              <CardDescription className="leading-5">{description}</CardDescription>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("grid gap-4 p-4", compact && "p-3")}>
        {children}
      </CardContent>
    </Card>
  );
}
