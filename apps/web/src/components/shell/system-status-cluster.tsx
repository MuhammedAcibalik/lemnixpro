import { Activity, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SystemStatusClusterProps = {
  className?: string;
};

export function SystemStatusCluster({ className }: SystemStatusClusterProps) {
  return (
    <div
      className={cn(
        "hidden items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs text-muted-foreground lg:flex",
        className
      )}
    >
      <Activity className="size-3.5 text-emerald-600" />
      <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]" />
      <span>Sistem hazır</span>
      <Badge className="hidden xl:inline-flex" variant="success">
        <ShieldCheck className="size-3" />
        Canlı
      </Badge>
    </div>
  );
}
