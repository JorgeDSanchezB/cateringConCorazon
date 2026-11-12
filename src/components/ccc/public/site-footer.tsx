"use client";

import { MessageCircle } from "lucide-react";
import { hashHref } from "@/components/ccc/shared/hash-router";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";

/**
 * Pie de página: pegado al fondo (mt-auto del layout flex del shell) y
 * empujado de forma natural cuando el contenido crece. Respeta el safe
 * area inferior de dispositivos móviles.
 */
export function SiteFooter() {
  const bootstrap = useBootstrapData();
  const settings = bootstrap?.settings;
  const brandName = settings?.brandName ?? "Catering con Corazón";
  const footerText = settings?.footerText ?? "";
  const wa = bootstrap?.whatsapp;
  const legalPages = bootstrap?.legalPages ?? [];
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t bg-muted/40 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="space-y-2">
          <p className="font-heading text-lg font-bold text-foreground">{brandName}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{footerText}</p>
        </div>

        <nav aria-label="Enlaces legales" className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Legal</p>
          <ul className="space-y-1.5">
            {legalPages.map((page) => (
              <li key={page.slug}>
                <a
                  href={hashHref(`legal/${page.slug}`)}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {page.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Contacto</p>
          {wa?.available && wa.waUrl ? (
            <a
              href={wa.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {wa.buttonLabel}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contacto temporalmente no disponible.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Atendemos eventos privados en Ecuador — sin entregas a domicilio: el
            catering se monta en tu evento.
          </p>
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            © {year} {brandName}. {footerText}
          </p>
          <a
            href={hashHref("admin")}
            className="rounded px-2 py-1 opacity-60 transition-opacity hover:opacity-100"
            title="Acceso del equipo"
          >
            Panel interno
          </a>
        </div>
      </div>
    </footer>
  );
}
