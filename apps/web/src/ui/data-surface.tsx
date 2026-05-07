import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DataSurfaceProps = {
  children: ReactNode;
  className?: string;
  minWidth?: number;
};

export function DataSurface({
  children,
  className,
  minWidth = 980
}: DataSurfaceProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border bg-card shadow-sm",
        className
      )}
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
