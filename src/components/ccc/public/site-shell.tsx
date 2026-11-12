"use client";

import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { WhatsAppFab } from "./whatsapp-fab";

/**
 * Shell público: layout flex column con min-h-screen → el pie queda pegado
 * al fondo en páginas cortas y se empuja naturalmente en páginas largas.
 */
export function SiteShell({
  path,
  navigate,
  children,
}: {
  path: string;
  navigate: (to: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <SiteHeader path={path} navigate={navigate} />
      <main id="contenido" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
