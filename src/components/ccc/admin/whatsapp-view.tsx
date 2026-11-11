"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminMutation, useDetail } from "@/components/ccc/admin/data-hooks";
import { ErrorBlock, FormField, LoadingBlock, ViewHeader } from "@/components/ccc/admin/ui-bits";
import { useBootstrap, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";
import { isValidWhatsAppPhone, renderTemplate } from "@/lib/whatsapp";

// Respuesta de GET /api/admin/whatsapp.
interface WhatsAppResponse {
  phoneNumber: string | null;
  defaultMessage: string;
  buttonLabel: string;
  configured: boolean;
}

/** Placeholders disponibles en la plantilla. */
const PLACEHOLDERS = [
  "BRAND",
  "ORDER_CODE",
  "CUSTOMER_NAME",
  "EVENT_DATE",
  "EVENT_LOCATION",
  "GUESTS",
  "ITEMS",
  "SUBTOTAL",
  "DISCOUNT",
  "TAX",
  "TOTAL",
  "NOTES",
];

export default function WhatsappView() {
  const fmt = useSiteFormat();
  const { data: bootstrap } = useBootstrap();
  const { data, isLoading, isError, error, refetch } = useDetail<WhatsAppResponse>("/api/admin/whatsapp");

  // Borrador editable.
  const [phone, setPhone] = useState<string | null>(null);
  const [buttonLabel, setButtonLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data && phone === null) {
      setPhone(data.phoneNumber ?? "");
      setButtonLabel(data.buttonLabel);
      setMessage(data.defaultMessage);
    }
  }, [data, phone]);

  const save = useAdminMutation<WhatsAppResponse, { phoneNumber: string | null; defaultMessage: string; buttonLabel: string }>(
    "PUT",
    "/api/admin/whatsapp",
    {
      successMessage: "Configuración de WhatsApp guardada.",
      invalidate: [["public-bootstrap"], ["/api/admin/whatsapp"]],
    },
  );

  if (isLoading) return <LoadingBlock label="Cargando configuración…" />;
  if (isError || !data) {
    return (
      <ErrorBlock
        message={error instanceof Error ? error.message : "No se pudo cargar la configuración de WhatsApp."}
        onRetry={() => void refetch()}
      />
    );
  }
  if (phone === null || buttonLabel === null || message === null) {
    return <LoadingBlock label="Preparando formulario…" />;
  }

  const trimmedPhone = phone.trim();
  const phoneValid = trimmedPhone === "" || isValidWhatsAppPhone(trimmedPhone);
  const phoneConfigured = trimmedPhone !== "" && phoneValid;

  const fieldErr = (field: string) => (save.error instanceof ApiError ? save.error.fieldMessage(field) : null);

  // Vista previa con datos de ejemplo claramente marcados.
  const brand = bootstrap?.settings.brandName ?? "Catering con Corazón";
  const preview = renderTemplate(message, {
    BRAND: brand,
    ORDER_CODE: "CCC-000123",
    CUSTOMER_NAME: "María Pérez",
    EVENT_DATE: "sábado 14 de marzo de 2026",
    EVENT_LOCATION: "Salón Los Almendros, Quito",
    GUESTS: "40",
    ITEMS: `2 × Cubano artesanal — ${fmt.money(1500)}\n1 × Bebida de naranja (1 L) — ${fmt.money(450)}`,
    SUBTOTAL: fmt.money(1950),
    DISCOUNT: fmt.money(0),
    TAX: fmt.money(0),
    TOTAL: fmt.money(1950),
    NOTES: "Sin cebolla en una bandeja, por favor.",
  });

  const submit = () => {
    save.mutate({
      // Cadena vacía → null (sin número configurado, con fallback en la web).
      phoneNumber: trimmedPhone === "" ? null : trimmedPhone,
      defaultMessage: message,
      buttonLabel: buttonLabel,
    });
  };

  return (
    <div className="space-y-6">
      <ViewHeader
        title="WhatsApp"
        description="Número de destino, etiqueta del botón y plantilla del mensaje que envía el cliente con su pedido."
      />

      {!phoneConfigured ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle aria-hidden />
          <AlertTitle>Sin número configurado</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            El botón del cliente mostrará un fallback y el pedido se registra igualmente. Configure un
            número E.164 (ej: +593998877665).
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Formulario */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              La plantilla admite los placeholders listados abajo; los desconocidos se dejan vacíos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Número de WhatsApp (E.164)"
              required
              error={fieldErr("phoneNumber")}
              hint="Con el + y sin espacios, ej: +593998877665. Vacío = sin número (fallback)."
            >
              <Input
                placeholder="+593998877665"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={phoneValid ? "" : "border-destructive"}
                aria-invalid={!phoneValid}
              />
            </FormField>
            {!phoneValid ? (
              <p className="text-xs text-destructive" role="alert">
                Formato E.164 requerido: + seguido de 8 a 15 dígitos.
              </p>
            ) : null}

            <FormField label="Texto del botón" required error={fieldErr("buttonLabel")}>
              <Input
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder="Reservar por WhatsApp"
              />
            </FormField>

            <FormField label="Plantilla del mensaje" required error={fieldErr("defaultMessage")}>
              <Textarea
                rows={12}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="font-mono text-sm"
              />
            </FormField>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Placeholders disponibles</p>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <code
                    key={p}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    {`{${p}}`}
                  </code>
                ))}
              </div>
            </div>

            <Button
              onClick={submit}
              disabled={save.isPending || !phoneValid || buttonLabel.trim().length < 2 || message.trim().length < 10}
            >
              <Save className="size-4" aria-hidden />
              Guardar configuración
            </Button>
          </CardContent>
        </Card>

        {/* Vista previa */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Ejemplo de vista previa</CardTitle>
            <CardDescription>
              Renderizado con datos ficticios: pedido CCC-000123, 2 ítems y total de {fmt.money(1950)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="mb-2 text-xs font-medium text-emerald-700">
                Mensaje que enviaría el cliente:
              </p>
              <div className="rounded-xl rounded-tl-sm border border-emerald-200 bg-white p-3">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {preview}
                </p>
              </div>
              <p className="mt-3 text-xs text-emerald-800">
                Destinatario: {phoneConfigured ? trimmedPhone : "sin número (fallback)"} · Botón:{" "}
                {buttonLabel.trim() === "" ? "Reservar por WhatsApp" : buttonLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
