import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-2 w-28" />
      <Skeleton className="h-2 w-56" />
    </div>
  );
}
