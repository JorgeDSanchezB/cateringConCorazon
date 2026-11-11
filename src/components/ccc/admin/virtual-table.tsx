"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Tabla virtualizada (@tanstack/react-virtual) para listados admin.
 * Claves ESTABLES (rowKey, nunca índice). Filas de altura fija (52px) con
 * render absoluto: 10 o 10.000 filas cuestan lo mismo en memoria de DOM.
 */
export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export function VirtualTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  maxHeightPx = 560,
  emptyMessage = "Sin registros.",
  rowHeight = 52,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  maxHeightPx?: number;
  emptyMessage?: string;
  rowHeight?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const alignClass = (align?: Column<T>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: columns.map((c) => c.width ?? "1fr").join(" ") }}>
        {columns.map((c) => (
          <div key={c.key} className={`px-3 py-2.5 ${alignClass(c.align)}`}>
            {c.header}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="overflow-y-auto ccc-scroll"
        style={{ maxHeight: maxHeightPx }}
        role="table"
        aria-rowcount={rows.length}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            return (
              <div
                key={rowKey(row)}
                role="row"
                tabIndex={onRowClick ? 0 : -1}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={`grid items-center border-t border-border/70 text-sm ${
                  onRowClick ? "cursor-pointer hover:bg-muted/50 focus:bg-muted/50 focus:outline-none" : ""
                }`}
                style={{
                  gridTemplateColumns: columns.map((c) => c.width ?? "1fr").join(" "),
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((c) => (
                  <div key={c.key} className={`min-w-0 truncate px-3 ${alignClass(c.align)}`}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
