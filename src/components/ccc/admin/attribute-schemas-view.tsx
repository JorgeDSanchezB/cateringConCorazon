"use client";

import { useState } from "react";
import { FileJson, History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDetail, useAdminMutation } from "./data-hooks";
import { FormField, LoadingBlock, ErrorBlock, ViewHeader } from "./ui-bits";
import { VirtualTable, type Column } from "./virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSession } from "./session";

// ── Tipos del contrato de /api/admin/attribute-schemas ──

interface SchemaRow {
  id: string;
  version: number;
  schemaJson: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

function fieldError(mutation: { error: Error | null }, field: string): string | null {
  return mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;
}

/**
 * Plantilla inicial válida para el dialog de nueva versión: replica el
 * esquema v1 del sistema (booleans, enum de picante y notas acotadas).
 */
const SCHEMA_TEMPLATE = JSON.stringify(
  {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    title: "Atributos de producto",
    properties: {
      sinGluten: { type: "boolean", description: "Apto sin gluten" },
      vegetariano: { type: "boolean", description: "Apto vegetariano" },
      nivelPicante: { type: "string", enum: ["suave", "medio", "fuerte"] },
      notas: { type: "string", maxLength: 80, description: "Nota breve para la carta" },
    },
    additionalProperties: false,
  },
  null,
  2,
);

/** Pretty-print tolerante del JSON del esquema (corrupto → mensaje). */
function prettySchemaJson(schemaJson: string): string {
  try {
    return JSON.stringify(JSON.parse(schemaJson), null, 2);
  } catch {
    return schemaJson;
  }
}

export default function AttributeSchemasView() {
  const fmt = useSiteFormat();
  const { user } = useSession();
  const canWrite = user?.role === "ADMIN";

  // GET sin cursor: responde { items: [...] } ordenado por versión descendente.
  const schemas = useDetail<{ items: SchemaRow[] }>("/api/admin/attribute-schemas", 15_000);
  const [viewing, setViewing] = useState<SchemaRow | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: Column<SchemaRow>[] = [
    {
      key: "version",
      header: "Versión",
      width: "100px",
      render: (row) => <span className="font-mono text-sm font-semibold">v{row.version}</span>,
    },
    {
      key: "description",
      header: "Descripción",
      render: (row) => (
        <span className="text-sm">{row.description ?? <span className="text-muted-foreground">Sin descripción</span>}</span>
      ),
    },
    {
      key: "isActive",
      header: "Estado",
      width: "110px",
      render: (row) =>
        row.isActive ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Activa
          </Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">Histórica</Badge>
        ),
    },
    {
      key: "createdAt",
      header: "Creada",
      width: "130px",
      render: (row) => <span className="text-xs text-muted-foreground">{fmt.date(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      width: "130px",
      align: "center",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewing(row)}
          aria-label={`Ver JSON del esquema v${row.version}`}
        >
          <FileJson className="size-4" aria-hidden /> Ver JSON
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Esquemas de atributos"
        description="Versiones del JSON Schema contra el que se validan los atributos dinámicos de los productos."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> Nueva versión
            </Button>
          ) : null
        }
      />

      <p className="text-sm leading-relaxed text-muted-foreground">
        Los productos guardan sus atributos validados contra la versión con la que se crearon;
        subir una versión nueva no rompe los existentes. El esquema debe declarar{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">properties</code> de tipos
        string/number/boolean (los enums se expresan como type string + enum). Se fuerza{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">additionalProperties:false</code>{" "}
        en persistencia, de modo que cualquier clave desconocida en un producto se rechaza con error
        de validación.
      </p>

      {schemas.isLoading ? (
        <LoadingBlock label="Cargando versiones…" />
      ) : schemas.isError ? (
        <ErrorBlock message={apiErrorMessage(schemas.error)} onRetry={() => void schemas.refetch()} />
      ) : (
        <VirtualTable
          rows={schemas.data?.items ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          emptyMessage="Todavía no hay esquemas de atributos."
        />
      )}

      {viewing ? (
        <SchemaJsonDialog key={viewing.id} schema={viewing} onClose={() => setViewing(null)} />
      ) : null}

      {creating ? <NewSchemaDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

// ─────────────────────── Dialog "Ver JSON" ───────────────────────

function SchemaJsonDialog({ schema, onClose }: { schema: SchemaRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Esquema v{schema.version}
            {schema.isActive ? " (activa)" : ""}
          </DialogTitle>
          <DialogDescription>{schema.description ?? "Sin descripción."}</DialogDescription>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
          {prettySchemaJson(schema.schemaJson)}
        </pre>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Dialog "Nueva versión" ───────────────────────

function NewSchemaDialog({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [schemaJson, setSchemaJson] = useState(SCHEMA_TEMPLATE);
  const [clientError, setClientError] = useState<string | null>(null);

  // Crear una nueva versión desactiva automáticamente la anterior (backend).
  const create = useAdminMutation<SchemaRow, { schemaJson: string; description?: string }>(
    "POST",
    "/api/admin/attribute-schemas",
    {
      successMessage: "Nueva versión de esquema creada y activada.",
      invalidate: [["/api/admin/attribute-schemas"]],
      onDone: onClose,
    },
  );

  function handleSubmit() {
    // Validación client-side: JSON parseable antes de gastar una versión.
    try {
      const parsed = JSON.parse(schemaJson) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setClientError("El esquema debe ser un objeto JSON.");
        return;
      }
    } catch {
      setClientError("JSON no válido. Corrige la sintaxis antes de publicar la versión.");
      return;
    }
    setClientError(null);
    // Descripción vacía → se omite la clave (el backend guarda null).
    create.mutate({
      schemaJson: schemaJson.trim(),
      ...(description.trim() !== "" ? { description: description.trim() } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva versión del esquema</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <History className="mt-0.5 size-4 shrink-0" aria-hidden />
            Se publicará como la siguiente versión y pasará a ser la ACTIVA (la anterior queda
            histórica). Los productos existentes siguen validando contra la versión con la que se
            crearon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            label="Descripción"
            error={fieldError(create, "description")}
            hint="Resumen breve del cambio (p. ej. “añade nivelPicante”)."
          >
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </FormField>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Esquema (JSON Schema simplificado)
            </Label>
            <Textarea
              value={schemaJson}
              onChange={(e) => setSchemaJson(e.target.value)}
              rows={14}
              className="font-mono text-xs"
              aria-label="Esquema en JSON"
              spellCheck={false}
            />
            {fieldError(create, "schemaJson") ?? clientError ? (
              <p className="text-xs text-destructive" role="alert">
                {fieldError(create, "schemaJson") ?? clientError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/80">
                properties con tipos string/number/boolean; enums como type string + enum. El
                servidor fuerza additionalProperties:false.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Publicando…" : "Publicar versión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
