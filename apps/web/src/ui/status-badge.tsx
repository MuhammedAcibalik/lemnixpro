import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/lib/status";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusTone;
};

const variantByTone: Record<StatusTone, ComponentProps<typeof Badge>["variant"]> = {
  danger: "destructive",
  info: "info",
  neutral: "neutral",
  planned: "neutral",
  success: "success",
  warning: "warning"
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return <Badge variant={variantByTone[tone]}>{children}</Badge>;
}
