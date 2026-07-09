import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-xl border border-slate-200/70 bg-card shadow-card">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-left text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-10 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(15,23,42,0.06)] backdrop-blur-sm [&_tr]:border-0",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("divide-y divide-slate-100 [&_tr:nth-child(even)]:bg-slate-50/40", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-slate-200/70 bg-slate-50/60 font-medium",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <tr
    ref={ref}
    data-state={selected ? "selected" : undefined}
    className={cn(
      "transition-smooth hover:bg-black/[0.02] data-[state=selected]:bg-accent-from/[0.06]",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortable?: boolean
    sortDirection?: "asc" | "desc" | false
    onSort?: () => void
  }
>(({ className, sortable, sortDirection, onSort, children, ...props }, ref) => {
  if (!sortable) {
    return (
      <th
        ref={ref}
        className={cn("px-4 py-3 font-medium", className)}
        {...props}
      >
        {children}
      </th>
    )
  }
  const Icon =
    sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ArrowUpDown
  return (
    <th ref={ref} className={cn("px-4 py-3 font-medium", className)} {...props}>
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 transition-smooth hover:text-slate-700",
          sortDirection && "text-accent-from"
        )}
      >
        {children}
        <Icon className={cn("h-3.5 w-3.5", !sortDirection && "opacity-40")} />
      </button>
    </th>
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-4 py-3 align-middle", className)} {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

/** Sel checkbox seragam untuk header/row bulk-select. */
const TableCheckboxCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { as?: "td" | "th" }
>(({ className, as = "td", children, ...props }, ref) => {
  const Comp = as as "td"
  return (
    <Comp
      ref={ref}
      className={cn("w-10 px-4 py-3 align-middle", className)}
      {...props}
    >
      {children}
    </Comp>
  )
})
TableCheckboxCell.displayName = "TableCheckboxCell"

/** Baris shimmer untuk loading state — jumlah baris & kolom bisa diatur. */
function TableSkeletonRows({
  rows = 5,
  columns = 4,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-5 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Baris empty-state built-in — dipakai lintas tabel supaya polanya seragam. */
function TableEmpty({
  colSpan,
  icon: IconComp = Inbox,
  title,
  description,
  action,
}: {
  colSpan: number
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <IconComp className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{title}</p>
          {description && (
            <p className="max-w-sm text-xs text-slate-400">{description}</p>
          )}
          {action}
        </div>
      </td>
    </tr>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableCheckboxCell,
  TableSkeletonRows,
  TableEmpty,
}
