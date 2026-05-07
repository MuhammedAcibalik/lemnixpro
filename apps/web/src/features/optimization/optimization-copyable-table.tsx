"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CopyableColumn<T> = {
  id: string;
  header: string;
  /** Plain text for clipboard (TSV / sütun kopyası) */
  accessor: (row: T) => string;
  /** Görünen hücre */
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
};

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

type TableSelection =
  | { kind: "none" }
  | { kind: "column"; colIndex: number }
  | { kind: "row"; rowIndex: number }
  | { kind: "cells"; keys: Set<string> };

function cellKey(rowIndex: number, colIndex: number) {
  return `r${rowIndex}c${colIndex}`;
}

function rectCellKeys(r0: number, c0: number, r1: number, c1: number) {
  const rLo = Math.min(r0, r1);
  const rHi = Math.max(r0, r1);
  const cLo = Math.min(c0, c1);
  const cHi = Math.max(c0, c1);
  const keys = new Set<string>();
  for (let r = rLo; r <= rHi; r++) {
    for (let c = cLo; c <= cHi; c++) {
      keys.add(cellKey(r, c));
    }
  }
  return keys;
}

function selectedCellsAsTsv<T>(
  keys: Set<string>,
  dataRows: T[],
  cols: CopyableColumn<T>[]
): string {
  if (keys.size === 0) {
    return "";
  }
  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;
  for (const k of keys) {
    const m = /^r(\d+)c(\d+)$/.exec(k);
    if (!m) {
      continue;
    }
    const r = Number(m[1]);
    const c = Number(m[2]);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  if (minR === Infinity) {
    return "";
  }
  const lines: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    const cells: string[] = [];
    for (let c = minC; c <= maxC; c++) {
      if (keys.has(cellKey(r, c))) {
        const col = cols[c];
        const row = dataRows[r];
        cells.push(col && row != null ? col.accessor(row) : "");
      } else {
        cells.push("");
      }
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

type OptimizationCopyableTableProps<T> = {
  title: string;
  description?: string;
  toolbarExtra?: ReactNode;
  /** Row element `key` için benzersiz önek (aynı sayfada birden fazla tablo için). */
  rowKeyPrefix: string;
  columns: CopyableColumn<T>[];
  rows: T[];
  emptyMessage: string;
};

function alignClass(a?: CopyableColumn<unknown>["align"]) {
  if (a === "center") {
    return "text-center";
  }
  if (a === "right") {
    return "text-right";
  }
  return "text-left";
}

export function OptimizationCopyableTable<T>({
  title,
  description,
  toolbarExtra,
  rowKeyPrefix,
  columns,
  rows,
  emptyMessage
}: OptimizationCopyableTableProps<T>) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selection, setSelection] = useState<TableSelection>({ kind: "none" });
  const gridRef = useRef<HTMLDivElement>(null);
  /** Sürükleme sırasında başlangıç hücresi (sol tuş basılıyken). */
  const dragAnchorRef = useRef<{ r: number; c: number } | null>(null);
  /** Shift + tık genişletmesi için sabit köşe */
  const shiftOriginRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    const root = gridRef.current;
    if (!root) {
      return;
    }
    const clearStructuralIfTextSelecting = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed) {
        return;
      }
      const anchor = sel.anchorNode;
      if (!anchor || !root.contains(anchor)) {
        return;
      }
      setSelection((prev) =>
        prev.kind === "column" || prev.kind === "row" ? { kind: "none" } : prev
      );
    };
    document.addEventListener("selectionchange", clearStructuralIfTextSelecting);
    return () =>
      document.removeEventListener("selectionchange", clearStructuralIfTextSelecting);
  }, []);

  useEffect(() => {
    const up = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const flash = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2200);
  }, []);

  const copyColumnVals = useCallback(
    async (colIndex: number) => {
      const col = columns[colIndex];
      if (!col) {
        return;
      }
      const lines = rows.map((r) => col.accessor(r));
      const ok = await copyToClipboard(lines.join("\n"));
      flash(
        ok
          ? `“${col.header}”: ${lines.length} hücre kopyalandı`
          : "Panoya yazılamadı"
      );
    },
    [columns, rows, flash]
  );

  const copyRowTsv = useCallback(
    async (row: T) => {
      const line = columns.map((c) => c.accessor(row)).join("\t");
      const ok = await copyToClipboard(line);
      flash(ok ? "Satır kopyalandı (sekme ile ayrılmış, Excel uyumlu)" : "Panoya yazılamadı");
    },
    [columns, flash]
  );

  const copyCells = useCallback(
    async (keys: Set<string>) => {
      const tsv = selectedCellsAsTsv(keys, rows, columns);
      const ok = await copyToClipboard(tsv);
      flash(ok ? `${keys.size} hücre kopyalandı (TSV)` : "Panoya yazılamadı");
    },
    [columns, rows, flash]
  );

  const copySelection = useCallback(async () => {
    if (selection.kind === "cells" && selection.keys.size > 0) {
      await copyCells(selection.keys);
      return;
    }
    const domSel = window.getSelection()?.toString().trim() ?? "";
    if (domSel.length > 0) {
      const ok = await copyToClipboard(domSel);
      flash(ok ? "Seçilen metin kopyalandı" : "Panoya yazılamadı");
      return;
    }
    if (selection.kind === "column") {
      await copyColumnVals(selection.colIndex);
      return;
    }
    if (selection.kind === "row") {
      const row = rows[selection.rowIndex];
      if (row) {
        await copyRowTsv(row);
      }
      return;
    }
    flash(
      "Hücreleri sürükleyerek seçin (Ctrl: tek hücre ekle/çıkar, Shift: dikdörtgen genişlet); veya başlık / satır numarası."
    );
  }, [selection, copyColumnVals, copyRowTsv, copyCells, rows, flash]);

  const copyFullTable = useCallback(async () => {
    const header = columns.map((c) => c.header).join("\t");
    const body = rows
      .map((r) => columns.map((c) => c.accessor(r)).join("\t"))
      .join("\n");
    const ok = await copyToClipboard(`${header}\n${body}`);
    flash(ok ? "Tüm tablo kopyalandı (başlık + satırlar, TSV)" : "Panoya yazılamadı");
  }, [columns, rows, flash]);

  const onGridKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (selection.kind === "cells" && selection.keys.size > 0) {
          e.preventDefault();
          void copyCells(selection.keys);
          return;
        }
        const sel = window.getSelection()?.toString().trim();
        if (sel && sel.length > 0) {
          return;
        }
        e.preventDefault();
        void copySelection();
      }
    },
    [selection, copyCells, copySelection]
  );

  const handleBodyCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number) => (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      window.getSelection()?.removeAllRanges?.();

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const k = cellKey(rowIndex, colIndex);
        setSelection((prev) => {
          if (prev.kind === "cells") {
            const next = new Set(prev.keys);
            if (next.has(k)) {
              next.delete(k);
            } else {
              next.add(k);
            }
            return next.size > 0 ? { kind: "cells", keys: next } : { kind: "none" };
          }
          return { kind: "cells", keys: new Set([k]) };
        });
        return;
      }

      if (e.shiftKey && shiftOriginRef.current) {
        e.preventDefault();
        const o = shiftOriginRef.current;
        setSelection({
          kind: "cells",
          keys: rectCellKeys(o.r, o.c, rowIndex, colIndex)
        });
        return;
      }

      shiftOriginRef.current = { r: rowIndex, c: colIndex };
      dragAnchorRef.current = { r: rowIndex, c: colIndex };
      setSelection({
        kind: "cells",
        keys: rectCellKeys(rowIndex, colIndex, rowIndex, colIndex)
      });
    },
    []
  );

  const handleBodyCellMouseEnter = useCallback(
    (rowIndex: number, colIndex: number) => (e: MouseEvent) => {
      const anchor = dragAnchorRef.current;
      if (!anchor || (e.buttons & 1) === 0) {
        return;
      }
      e.preventDefault();
      setSelection({
        kind: "cells",
        keys: rectCellKeys(anchor.r, anchor.c, rowIndex, colIndex)
      });
    },
    []
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-12 text-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback ? (
        <p
          className="rounded-md border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h3>
          {description ? (
            <p className="text-xs leading-relaxed text-zinc-500">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {toolbarExtra ? <div className="flex flex-wrap gap-2">{toolbarExtra}</div> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-zinc-200 bg-white text-xs shadow-sm"
            onClick={() => void copySelection()}
          >
            <Copy className="size-3.5 opacity-70" /> Seçimi kopyala
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-zinc-200 bg-white text-xs shadow-sm"
            onClick={() => void copyFullTable()}
          >
            <Table2 className="size-3.5 opacity-70" /> Tüm tablo (TSV)
          </Button>
        </div>
      </div>

      <div
        ref={gridRef}
        className="overflow-x-auto rounded-xl border border-zinc-300 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-zinc-400"
        role="grid"
        tabIndex={0}
        onKeyDown={onGridKeyDown}
      >
        <Table className="min-w-[720px] border-collapse text-sm">
          <TableHeader>
            <TableRow className="border-b border-zinc-300 bg-zinc-100 hover:bg-zinc-100">
              <TableHead
                className="sticky left-0 z-20 w-11 min-w-11 border-r border-zinc-300 bg-zinc-200 px-0 py-0 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-600"
                scope="col"
              >
                <span className="sr-only">Köşe</span>
              </TableHead>
              {columns.map((col, colIndex) => {
                const colSelected =
                  selection.kind === "column" && selection.colIndex === colIndex;
                return (
                  <TableHead
                    key={col.id}
                    scope="col"
                    className={cn(
                      "cursor-pointer select-none border-b border-zinc-300 px-2 py-2 align-bottom transition-colors",
                      alignClass(col.align),
                      col.headerClassName,
                      colSelected
                        ? "bg-sky-200 ring-2 ring-inset ring-sky-500 shadow-inner"
                        : "bg-zinc-100 hover:bg-zinc-200/90"
                    )}
                    title={`“${col.header}”: tüm sütunu seçmek için tıklayın (yeniden tıklayınca kalkar)`}
                    onClick={() => {
                      dragAnchorRef.current = null;
                      shiftOriginRef.current = null;
                      setSelection((prev) =>
                        prev.kind === "column" && prev.colIndex === colIndex
                          ? { kind: "none" }
                          : { kind: "column", colIndex }
                      );
                    }}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-900">
                      {col.header}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const key = `${rowKeyPrefix}-${rowIndex}`;
              const rowSelected =
                selection.kind === "row" && selection.rowIndex === rowIndex;
              return (
                <TableRow
                  key={key}
                  className={cn(
                    "border-b border-zinc-200 transition-colors",
                    rowSelected
                      ? "bg-sky-100 ring-2 ring-inset ring-sky-400/70"
                      : "odd:bg-white even:bg-zinc-50/50 hover:bg-zinc-100/70"
                  )}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 w-11 min-w-11 cursor-pointer select-none border-r border-zinc-300 bg-zinc-100 px-0 py-0 text-center font-mono text-[11px] font-medium text-zinc-600 transition-[box-shadow,background-color]",
                      rowSelected &&
                        "bg-sky-200 font-semibold text-sky-950 ring-2 ring-inset ring-sky-500 shadow-inner"
                    )}
                    title="Satırı seçmek için tıklayın; çift tık satırı hemen kopyalar"
                    onClick={() => {
                      dragAnchorRef.current = null;
                      shiftOriginRef.current = null;
                      setSelection((prev) =>
                        prev.kind === "row" && prev.rowIndex === rowIndex
                          ? { kind: "none" }
                          : { kind: "row", rowIndex }
                      );
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      void copyRowTsv(row);
                    }}
                  >
                    {rowIndex + 1}
                  </TableCell>
                  {columns.map((col, colIndex) => {
                    const colSel =
                      selection.kind === "column" && selection.colIndex === colIndex;
                    const inRange =
                      selection.kind === "cells" &&
                      selection.keys.has(cellKey(rowIndex, colIndex));
                    const cellSel = inRange || colSel || rowSelected;
                    return (
                      <TableCell
                        key={`${key}-${col.id}`}
                        className={cn(
                          "max-w-[28rem] cursor-cell border-r border-zinc-100 py-2 align-middle text-zinc-800 transition-[background-color,box-shadow] last:border-r-0 select-none",
                          alignClass(col.align),
                          col.className,
                          cellSel &&
                            "bg-sky-200/90 ring-1 ring-inset ring-sky-500/55 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.45)]"
                        )}
                        onMouseDown={handleBodyCellMouseDown(rowIndex, colIndex)}
                        onMouseEnter={handleBodyCellMouseEnter(rowIndex, colIndex)}
                      >
                        {col.cell(row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-700">Seçim:</span> veri hücresinde basılı tutup sürükleyin (
        dikdörtgen), <span className="font-medium text-zinc-700">Shift</span> ile son tıklanan köşeden yeni
        dikdörtgen,
        <span className="font-medium text-zinc-700"> Ctrl/Cmd</span> ile tek tek hücre ekleyin veya çıkarın.
        <span className="font-medium text-zinc-700"> Seçimi kopyala</span> yalnızca seçili hücreleri TSV
        olarak alır; başlık veya satır numarası tam sütun/satır seçer. Satır numarasına çift tık satırı anında
        kopyalar.
      </p>
    </div>
  );
}
