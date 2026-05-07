import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title?: string;
  description?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  action,
  children,
  className,
  description,
  title
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-dashed border-border/80 bg-muted/35 p-4 text-sm text-muted-foreground",
        className
      )}
    >
      {title ? <p className="font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="leading-6">{description}</p> : null}
      {children ? <div className="leading-6">{children}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
