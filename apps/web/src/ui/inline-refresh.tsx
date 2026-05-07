import { cn } from "@/lib/utils";

type InlineRefreshProps = {
  className?: string;
  label?: string;
};

export function InlineRefresh({
  className,
  label = "Güncelleniyor"
}: InlineRefreshProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground",
        className
      )}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
      {label}
    </span>
  );
}
