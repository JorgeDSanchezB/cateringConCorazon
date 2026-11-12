"use client";

import { useEffect } from "react";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppProviders } from "@/components/ccc/shared/providers";
import { useHashRoute, hashHref } from "@/components/ccc/shared/hash-router";
import { useBootstrap, useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { applyThemeCss } from "@/components/ccc/shared/theme-apply";
import type { PublicBootstrap } from "@/lib/services/public-data";
import { SiteShell } from "@/components/ccc/public/site-shell";
import { HomeView } from "@/components/ccc/public/home-view";
import { CatalogView } from "@/components/ccc/public/catalog-view";
import { CombosView } from "@/components/ccc/public/combos-view";
import { EventsView } from "@/components/ccc/public/events-view";
import { FaqView } from "@/components/ccc/public/faq-view";
import { LegalView } from "@/components/ccc/public/legal-view";
import { CartView } from "@/components/ccc/public/cart-view";
import { AdminApp } from "@/components/ccc/admin/admin-app";
import { PageContainer } from "@/components/ccc/public/ui";

/**
 * Raíz de la aplicación (SPA en "/" con router hash — ADR-002).
 * El servidor entrega el bootstrap inicial (primera pintura sin parpadeo);
 * el cliente lo actualiza cada 60 s o al invalidar tras guardar en admin.
 */
function AppInner({ initialBootstrap }: { initialBootstrap: PublicBootstrap }) {
  const { path, navigate } = useHashRoute();
  const bootstrap = useBootstrap(initialBootstrap);

  // Tema en caliente: si el admin cambia colores/tipografías, se aplican
  // sin recargar servidor ni página.
  useEffect(() => {
    if (bootstrap.data) applyThemeCss(bootstrap.data.theme);
  }, [bootstrap.data]);

  if (path.startsWith("admin")) {
    return <AdminApp path={path} navigate={navigate} />;
  }

  let content: React.ReactNode;
  if (path === "inicio") {
    content = <HomeView navigate={navigate} />;
  } else if (path === "catalogo") {
    content = <CatalogView />;
  } else if (path === "combos") {
    content = <CombosView />;
  } else if (path === "eventos") {
    content = <EventsView />;
  } else if (path === "carrito") {
    content = <CartView navigate={navigate} />;
  } else if (path === "faq") {
    content = <FaqView />;
  } else if (path.startsWith("legal/")) {
    content = <LegalView slug={path.slice("legal/".length)} />;
  } else {
    content = <NotFoundView navigate={navigate} />;
  }

  return (
    <SiteShell path={path} navigate={navigate}>
      {content}
    </SiteShell>
  );
}

function NotFoundView({ navigate }: { navigate: (to: string) => void }) {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md space-y-5 text-center">
        <Compass className="mx-auto size-12 text-muted-foreground/50" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-bold">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La dirección que buscas no existe o fue movida.
        </p>
        <Button asChild>
          <a href={hashHref("inicio")} onClick={(e) => { e.preventDefault(); navigate("inicio"); }}>
            Volver al inicio
          </a>
        </Button>
      </div>
    </PageContainer>
  );
}

export function App({ initialBootstrap }: { initialBootstrap: PublicBootstrap }) {
  return (
    <AppProviders>
      <AppInner initialBootstrap={initialBootstrap} />
    </AppProviders>
  );
}
