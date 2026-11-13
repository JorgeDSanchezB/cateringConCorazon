"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Inbox, ChevronDown } from "lucide-react";

/**
 * Piezas UI compartidas del admin (sin duplicar lógica de presentación).
 */

export function FormField({
  label,
  error,
  required,
  children,
  hint,
}: {
  label: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground/80">{hint}</p> : null}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Parseo TOLERANTE de dinero mientras se teclea (estados intermedios válidos):
 * acepta "4", "4.", "4.5", "4.50", "4,50" (coma decimal) y ".5".
 * Devuelve null si está vacío o no es parseable. Máximo 2 decimales.
 */
export function parseMoneyInputToCents(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(t)) return null;
  const value = t.endsWith(".") ? t.slice(0, -1) : t;
  return Math.round(Number(value) * 100);
}

/**
 * Entrada de dinero en dólares que emite CENTAVOS.
 * Mantiene el TEXTO tal cual lo teclea el usuario (para poder escribir
 * "4.50" sin que el formato pise cada tecla) y normaliza a "4.50"
 * al perder el foco. Acepta coma decimal (es-EC) y estados parciales
 * como "4." o "4.5".
 *
 * Sincronización con el padre SIN efectos ni refs (patrón de estado
 * derivado): cada tecla emite el centavo parseado y el padre lo refleja
 * en `cents`; si `cents` difiere de lo que el texto actual representa,
 * es un cambio EXTERNO (carga de otro registro / reset) y adoptamos ese
 * valor como texto.
 */
export function MoneyInput({
  cents,
  onCentsChange,
  placeholder,
  disabled,
  id,
}: {
  cents: number | null;
  onCentsChange: (cents: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(cents === null ? "" : (cents / 100).toFixed(2));

  const parsedText = parseMoneyInputToCents(text);
  if (cents !== parsedText) {
    // Cambio externo (no provocado por este input): adopta el valor del padre.
    // La guarda `canonical !== text` evita bucles con textos no parseables.
    const canonical = cents === null ? "" : (cents / 100).toFixed(2);
    if (canonical !== text) setText(canonical);
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder ?? "0.00"}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onCentsChange(parseMoneyInputToCents(e.target.value));
      }}
      onBlur={() => {
        // Normaliza al salir: "4.5"/"4," → "4.50"; basura → último valor real.
        const parsed = parseMoneyInputToCents(text);
        if (parsed !== null) {
          const canonical = (parsed / 100).toFixed(2);
          if (canonical !== text) setText(canonical);
          onCentsChange(parsed);
        } else {
          const canonical = cents === null ? "" : (cents / 100).toFixed(2);
          if (canonical !== text) setText(canonical);
          onCentsChange(cents);
        }
      }}
      aria-label="Monto en dólares"
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-900 border-amber-200",
  CONFIRMED: "bg-sky-100 text-sky-900 border-sky-200",
  IN_PREPARATION: "bg-violet-100 text-violet-900 border-violet-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 border-emerald-200",
  CANCELLED: "bg-rose-100 text-rose-900 border-rose-200",
  ACTIVE: "bg-emerald-100 text-emerald-900 border-emerald-200",
  VOID: "bg-rose-100 text-rose-900 border-rose-200",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRMATION: "Pendiente",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "En preparación",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  ACTIVE: "Activa",
  VOID: "Anulada",
  ADMIN: "Administrador",
  STAFF: "Staff",
  CONTADOR: "Contador",
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${STATUS_STYLES[status] ?? ""}`}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  return channel === "ONSITE" ? (
    <Badge variant="outline" className="whitespace-nowrap border-orange-200 bg-orange-50 text-orange-900">
      Venta en evento
    </Badge>
  ) : (
    <Badge variant="outline" className="whitespace-nowrap border-teal-200 bg-teal-50 text-teal-900">
      Reserva web
    </Badge>
  );
}

export function LoadingBlock({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ message = "Sin registros." }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Inbox className="mx-auto mb-2 size-6 opacity-60" aria-hidden />
      {message}
    </div>
  );
}

export function LoadMoreButton({ onClick, disabled, loading }: { onClick: () => void; disabled: boolean; loading: boolean }) {
  if (disabled) return null;
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="w-full">
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      Cargar más
    </Button>
  );
}

/** Cabecera estándar de vista admin. */
export function ViewHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
