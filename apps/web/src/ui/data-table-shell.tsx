import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { InlineRefresh } from "./inline-refresh";

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "center" | "right";
  width?: number | string;
};

type DataTableShellProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyTitle: string;
  emptyDescription?: string;
  minWidth?: number;
  className?: string;
  density?: "compact" | "comfortable";
  isFetching?: boolean;
  mobileCard?: (row: T) => ReactNode;
  rowActions?: (row: T) => ReactNode;
  stickyOffset?: number | string;
  toolbar?: ReactNode;
};

export function DataTableShell<T>({
  className,
  columns,
  density = "compact",
  emptyDescription,
  emptyTitle,
  getRowKey,
  isFetching = false,
  minWidth = 980,
  mobileCard,
  rowActions,
  stickyOffset = 0,
  toolbar,
  rows
}: DataTableShellProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={cn("grid gap-3", className)}>
        {toolbar ? <div>{toolbar}</div> : null}
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const rowClassName =
    density === "comfortable" ? "h-12" : "h-10";
  const cellClassName =
    density === "comfortable" ? "py-3 text-sm" : "py-2 text-sm";
  const headerTop =
    typeof stickyOffset === "number" ? `${stickyOffset}px` : stickyOffset;

  return (
    <div className={cn("grid gap-3", className)}>
      {toolbar || isFetching ? (
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <div>{toolbar}</div>
          {isFetching ? <InlineRefresh /> : null}
        </div>
      ) : null}
      {mobileCard ? (
        <div aria-label="Mobil kayıt özeti" className="grid gap-3 md:hidden">
          {rows.map((row) => (
            <div key={getRowKey(row)}>{mobileCard(row)}</div>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-x-auto rounded-md border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          mobileCard && "hidden md:block"
        )}
        aria-busy={isFetching || undefined}
      >
        <Table style={{ minWidth }}>
          <TableHeader className="bg-muted/65">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  className={cn(
                    "sticky top-0 z-10 h-10 bg-muted/95 text-[11px] uppercase tracking-normal",
                    alignClass(column.align),
                    column.headerClassName
                  )}
                  key={column.id}
                  style={{
                    top: headerTop,
                    width: column.width
                  }}
                >
                  {column.header}
                </TableHead>
              ))}
              {rowActions ? (
                <TableHead
                  className="sticky top-0 z-10 h-10 w-1 bg-muted/95 text-right text-[11px] uppercase tracking-normal"
                  style={{ top: headerTop }}
                >
                  İşlem
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const rowKey = getRowKey(row);

              return (
                <TableRow
                  className={rowClassName}
                  key={rowKey}
                >
                  {columns.map((column) => (
                    <TableCell
                      className={cn(
                        "leading-5",
                        cellClassName,
                        alignClass(column.align),
                        column.className
                      )}
                      key={`${rowKey}-${column.id}`}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions ? (
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right",
                        cellClassName
                      )}
                    >
                      {rowActions(row)}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function alignClass(align?: DataTableColumn<unknown>["align"]) {
  if (align === "center") {
    return "text-center";
  }

  if (align === "right") {
    return "text-right";
  }

  return "text-left";
}
