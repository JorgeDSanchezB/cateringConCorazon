"use client";

import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  Clock,
  Package,
  Store,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDetail } from "@/components/ccc/admin/data-hooks";
import {
  ChannelBadge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { VirtualTable, type Column } from "@/components/ccc/admin/virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { hashHref } from "@/components/ccc/shared/hash-router";

// Formas de la respuesta de /api/admin/overview.
interface LowStockItem {
  productId: string;
  name: string;
  quantity: number;
  threshold: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenueCents: number;
}

interface RecentOrder {
  id: string;
  code: string;
  channel: string;
  status: string;
  total: number;
  customerName: string | null;
  createdAt: string;
}

interface OverviewData {
  pendingOrders: number;
  ordersToday: number;
  onsiteSalesTodayCents: number;
  onsiteSalesTodayCount: number;
  incomeMonthCents: number;
  expenseMonthCents: number;
  balanceMonthCents: number;
  lowStock: LowStockItem[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
}

/** Tarjeta de métrica con ícono y enlace de acción. */
function MetricCard({
  label,
  value,
  hint,
  icon,
  href,
  hrefLabel,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  href: string;
  hrefLabel: string;
  valueClassName?: string;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${valueClassName ?? ""}`}>{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <CardAction>
          <div
            className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden
          >
            {icon}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Button asChild variant="ghost" size="sm" className="h-auto gap-1 px-2 text-muted-foreground">
          <a href={href}>{hrefLabel}</a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DashboardView() {
  const fmt = useSiteFormat();
  const { data, isLoading, isError, error, refetch } = useDetail<OverviewData>("/api/admin/overview");

  if (isLoading) return <LoadingBlock label="Cargando panel…" />;
  if (isError || !data) {
    return <ErrorBlock message="No se pudo cargar el resumen." onRetry={() => void refetch()} />;
  }

  const pedidosHref = hashHref("admin/pedidos");
  const contabilidadHref = hashHref("admin/contabilidad");
  const balancePositive = data.balanceMonthCents >= 0;

  const recentColumns: Column<RecentOrder>[] = [
    { key: "code", header: "Código", width: "120px", render: (o) => <span className="font-mono text-xs">{o.code}</span> },
    { key: "channel", header: "Canal", width: "150px", render: (o) => <ChannelBadge channel={o.channel} /> },
    { key: "status", header: "Estado", width: "130px", render: (o) => <StatusBadge status={o.status} /> },
    { key: "total", header: "Total", width: "100px", align: "right", render: (o) => fmt.money(o.total) },
    {
      key: "createdAt",
      header: "Fecha",
      render: (o) => <span className="text-muted-foreground">{fmt.datetime(o.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Panel de control"
        description="Resumen operativo del día y del mes en curso."
      />

      {/* Métricas principales */}
      <section aria-label="Métricas" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Pedidos pendientes"
          value={String(data.pendingOrders)}
          icon={<Clock className="size-5" aria-hidden />}
          href={pedidosHref}
          hrefLabel="Ver pedidos"
        />
        <MetricCard
          label="Pedidos hoy"
          value={String(data.ordersToday)}
          icon={<CalendarCheck className="size-5" aria-hidden />}
          href={pedidosHref}
          hrefLabel="Ver pedidos"
        />
        <MetricCard
          label="Ventas en evento hoy"
          value={fmt.money(data.onsiteSalesTodayCents)}
          hint={`${data.onsiteSalesTodayCount} venta(s) registrada(s) hoy`}
          icon={<Store className="size-5" aria-hidden />}
          href={pedidosHref}
          hrefLabel="Ver pedidos"
        />
        <MetricCard
          label="Ingresos del mes"
          value={fmt.money(data.incomeMonthCents)}
          icon={<ArrowDownLeft className="size-5" aria-hidden />}
          href={contabilidadHref}
          hrefLabel="Ir a contabilidad"
        />
        <MetricCard
          label="Egresos del mes"
          value={fmt.money(data.expenseMonthCents)}
          icon={<ArrowUpRight className="size-5" aria-hidden />}
          href={contabilidadHref}
          hrefLabel="Ir a contabilidad"
        />
        <MetricCard
          label="Balance del mes"
          value={fmt.money(data.balanceMonthCents)}
          hint={balancePositive ? "Ingresos por encima de los egresos" : "Los egresos superan los ingresos"}
          icon={<Wallet className="size-5" aria-hidden />}
          href={contabilidadHref}
          hrefLabel="Ir a contabilidad"
          valueClassName={balancePositive ? "text-emerald-700" : "text-rose-700"}
        />
      </section>

      {/* Stock bajo y top productos */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4 text-primary" aria-hidden />
              Stock bajo
            </CardTitle>
            <CardDescription>Productos en o por debajo del umbral mínimo.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <EmptyBlock message="Todo el stock está por encima del umbral." />
            ) : (
              <ul className="divide-y">
                {data.lowStock.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} u. disponibles / umbral {item.threshold} u.
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={hashHref("admin/inventario")}>Ajustar</a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top productos</CardTitle>
            <CardDescription>Más vendidos en pedidos completados.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <EmptyBlock message="Aún no hay ventas completadas." />
            ) : (
              <ul className="divide-y">
                {data.topProducts.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="whitespace-nowrap">
                        {p.quantity} vendidos
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">{fmt.money(p.revenueCents)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Pedidos recientes */}
      <section aria-label="Pedidos recientes">
        <VirtualTable
          rows={data.recentOrders}
          columns={recentColumns}
          rowKey={(o) => o.id}
          maxHeightPx={360}
          emptyMessage="Sin pedidos recientes."
        />
      </section>
    </div>
  );
}
