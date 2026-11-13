"use client";

import ReactMarkdown from "react-markdown";
import { AlertTriangle, FileClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage, ApiError } from "@/components/ccc/shared/api-client";
import { useBootstrapData, useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/ccc/admin/ui-bits";
import { PageContainer } from "./ui";

interface LegalPageData {
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
}

const MARKDOWN_COMPONENTS = {
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mt-8 font-heading text-xl font-bold text-foreground first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mt-6 font-heading text-lg font-semibold text-foreground" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a className="font-medium text-primary underline underline-offset-4" {...props} />
  ),
};

/**
 * Página legal pública: contenido editable desde el admin + DISCLAIMER
 * obligatorio de revisión legal (texto en SiteSetting.legal_disclaimer).
 */
export function LegalView({ slug }: { slug: string }) {
  const bootstrap = useBootstrapData();
  const { datetime } = useSiteFormat();
  const disclaimer = bootstrap?.settings.legalDisclaimer ?? "";

  const page = useQuery<LegalPageData>({
    queryKey: [`/api/public/legal/${slug}`],
    queryFn: () => api<LegalPageData>(`/api/public/legal/${slug}`),
    retry: 1,
  });

  if (page.isLoading) return <PageContainer><LoadingBlock label="Cargando documento legal…" /></PageContainer>;
  if (page.isError) {
    // 404 = página inexistente o desactivada por el admin: estado informativo,
    // sin reintentar (reintentar no la va a publicar). El resto de errores
    // sí son transitorios y ofrecen reintento (Regla 4).
    const isNotFound = page.error instanceof ApiError && page.error.problem.status === 404;
    if (isNotFound) {
      return (
        <PageContainer>
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <FileClock className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-heading text-lg font-semibold text-foreground">
              Documento no disponible temporalmente
            </p>
            <p className="text-sm text-muted-foreground">{apiErrorMessage(page.error)}</p>
          </div>
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <ErrorBlock message={apiErrorMessage(page.error)} onRetry={() => void page.refetch()} />
      </PageContainer>
    );
  }

  const data = page.data ?? null;

  return (
    <PageContainer>
      {!data ? (
        <EmptyBlock message="Documento no disponible." />
      ) : (
      <article className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{data.title}</h1>
          <p className="text-xs text-muted-foreground">Última actualización: {datetime(data.updatedAt)}</p>
        </header>

        {disclaimer ? (
          <aside
            role="note"
            className="flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-relaxed">{disclaimer}</p>
          </aside>
        ) : null}

        <div className="rounded-xl border bg-card p-6 text-card-foreground theme-shadow sm:p-8">
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{data.content}</ReactMarkdown>
        </div>
      </article>
      )}
    </PageContainer>
  );
}
