"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { FormField, LoadingBlock, ErrorBlock, ViewHeader } from "./ui-bits";

/**
 * Editor de páginas legales (privacidad, cookies, términos, aviso legal).
 * - Disclaimer global visible (obligatorio antes de publicar).
 * - Borrador asistido por IA (endpoint /api/admin/ai/draft con z-ai-web-dev-sdk,
 *   ejecutado 100% en backend) — el texto generado SIEMPRE se marca como
 *   borrador revisable; no sustituye asesoría legal.
 */

interface LegalListResponse {
  items: { slug: string; title: string; updatedAt: string }[];
}

interface LegalDetailResponse {
  page: { slug: string; title: string; content: string; updatedAt: string };
  disclaimer: string;
}

export default function LegalAdminView() {
  const queryClient = useQueryClient();
  const { datetime } = useSiteFormat();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const list = useQuery<LegalListResponse>({
    queryKey: ["/api/admin/legal"],
    queryFn: () => api<LegalListResponse>("/api/admin/legal"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedSlug && list.data?.items.length) {
      setSelectedSlug(list.data.items[0]!.slug);
    }
  }, [list.data, selectedSlug]);

  const detail = useQuery<LegalDetailResponse>({
    queryKey: [`/api/admin/legal/${selectedSlug}`],
    queryFn: () => api<LegalDetailResponse>(`/api/admin/legal/${selectedSlug}`),
    enabled: selectedSlug !== null,
    staleTime: 10_000,
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  // Sincroniza el editor cuando cambia la página seleccionada o el servidor.
  useEffect(() => {
    if (detail.data && detail.data.page.slug !== loadedSlug) {
      setTitle(detail.data.page.title);
      setContent(detail.data.page.content);
      setLoadedSlug(detail.data.page.slug);
    }
  }, [detail.data, loadedSlug]);

  async function handleSave() {
    if (!selectedSlug) return;
    setSaving(true);
    try {
      await api(`/api/admin/legal/${selectedSlug}`, {
        method: "PUT",
        retry: false,
        body: { title: title.trim(), content: content.trim() },
      });
      toast.success("Página legal guardada");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/legal"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/legal/${selectedSlug}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/public/legal/${selectedSlug}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/public/bootstrap"] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDraft() {
    if (!selectedSlug) return;
    setDrafting(true);
    try {
      const result = await api<{ text: string }>("/api/admin/ai/draft", {
        method: "POST",
        retry: false,
        body: {
          kind: "legal",
          slug: selectedSlug,
          currentTitle: title.trim() || undefined,
        },
      });
      if (result.text.trim().length < 50) {
        throw new Error("El borrador generado es demasiado corto; revisa el prompt e inténtalo de nuevo.");
      }
      const confirmed = window.confirm(
        "Se reemplazará el contenido actual del editor con el borrador de la IA " +
          "(no se guarda en la base de datos hasta que pulses «Guardar página»). ¿Continuar?",
      );
      if (confirmed) {
        setContent(result.text);
        toast.success("Borrador cargado en el editor — revísalo antes de guardar.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Páginas legales"
        description="Plantillas completas editables de la web pública: privacidad, cookies, términos y aviso legal."
      />

      <aside
        role="note"
        className="flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-relaxed">
          {detail.data?.disclaimer ??
            "Las plantillas legales son borradores generados automáticamente y no constituyen asesoría legal. Revísalas con un abogado colegiado en Ecuador antes de publicar."}
        </p>
      </aside>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Páginas legales" className="space-y-1.5">
          {list.isLoading ? (
            <LoadingBlock label="Cargando páginas…" />
          ) : list.isError ? (
            <ErrorBlock message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : (
            list.data?.items.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => {
                  setSelectedSlug(item.slug);
                  setLoadedSlug(null);
                }}
                aria-current={selectedSlug === item.slug ? "true" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedSlug === item.slug
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-card-foreground hover:border-primary/40"
                }`}
              >
                <FileText className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate font-medium">{item.title}</span>
              </button>
            ))
          )}
        </nav>

        <section aria-label="Editor de la página legal" className="space-y-4">
          {detail.isLoading ? (
            <LoadingBlock label="Cargando editor…" />
          ) : detail.isError ? (
            <ErrorBlock message={apiErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          ) : selectedSlug && loadedSlug === selectedSlug ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Actualizada: {datetime(detail.data?.page.updatedAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleDraft} disabled={drafting}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    {drafting ? "Generando borrador…" : "Generar borrador con IA"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="size-4" aria-hidden="true" />
                    {saving ? "Guardando…" : "Guardar página"}
                  </Button>
                </div>
              </div>

              <FormField label="Título" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </FormField>

              <div className="space-y-1.5">
                <Label htmlFor="legal-content" className="text-xs font-medium text-muted-foreground">
                  Contenido (Markdown: ## títulos, listas, **negritas**)
                </Label>
                <Textarea
                  id="legal-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={24}
                  className="font-mono text-xs leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">
                  {content.length} caracteres · mínimo 50 requeridos por el servidor.
                </p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
