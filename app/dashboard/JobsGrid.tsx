"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export type GridRow = {
  id: string;
  title: string;
  type: string;
  seller: string;
  buyer: string;
  amount: number;
  paid: number | null;
  captured: number;
  returned: number;
  checks: string;
  status: string;
  created: string;
};

const theme = themeQuartz.withParams({
  fontFamily: "Archivo, system-ui, sans-serif",
  foregroundColor: "#13233F",
  backgroundColor: "#FFFFFF",
  headerBackgroundColor: "#F4F6F3",
  borderColor: "#D8DED7",
  accentColor: "#13233F",
  rowHoverColor: "#F4F6F3",
  wrapperBorderRadius: 14,
  headerFontWeight: 600,
});

const usd = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("en-US", { style: "currency", currency: "USD" }));

export default function JobsGrid({ rows }: { rows: GridRow[] }) {
  const router = useRouter();
  const cols = useMemo<ColDef<GridRow>[]>(
    () => [
      { field: "title", headerName: "Job", flex: 2, minWidth: 170 },
      { field: "type", headerName: "Type", flex: 1.2, minWidth: 120, filter: true },
      { field: "seller", headerName: "Seller", flex: 1.4, minWidth: 130, filter: true },
      { field: "amount", headerName: "Held", type: "rightAligned", valueFormatter: (p) => usd(p.value), flex: 1, minWidth: 90 },
      {
        field: "paid",
        headerName: "Paid",
        type: "rightAligned",
        flex: 0.8,
        minWidth: 70,
        valueFormatter: (p) => (p.value == null ? "" : `${p.value}%`),
        cellStyle: (p) => (p.value == null ? null : { fontWeight: 600, color: p.value >= 100 ? "#17845A" : p.value === 0 ? "#B23A2E" : "#8a5f08" }),
      },
      { field: "captured", headerName: "To seller", type: "rightAligned", valueFormatter: (p) => usd(p.value), flex: 1, minWidth: 95 },
      { field: "returned", headerName: "To buyer", type: "rightAligned", valueFormatter: (p) => usd(p.value), flex: 1, minWidth: 95 },
      { field: "checks", headerName: "Checks", flex: 0.9, minWidth: 90, filter: true, cellStyle: (p) => (p.value === "Caught" ? { color: "#B23A2E", fontWeight: 600 } : null) },
      { field: "status", headerName: "Status", flex: 1, minWidth: 110, filter: true },
      { field: "created", headerName: "Created", flex: 1, minWidth: 110, sort: "desc", valueFormatter: (p) => new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
    ],
    [],
  );

  if (!rows.length) return <p className="text-muted">No jobs yet. Create one and it will appear here.</p>;

  return (
    <div style={{ height: Math.min(560, 56 + rows.length * 44) }}>
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: true, resizable: true }}
        rowHeight={44}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => e.data && router.push(`/jobs/${e.data.id}`)}
        rowStyle={{ cursor: "pointer" }}
      />
    </div>
  );
}
