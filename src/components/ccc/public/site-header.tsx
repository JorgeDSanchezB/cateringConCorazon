"use client";

import { useState } from "react";
import { Menu, MessageCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { hashHref } from "@/components/ccc/shared/hash-router";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { useCart, cartCount } from "@/components/ccc/store/cart";
import { CartSheet } from "./cart-drawer";

 

const NAV_ITEMS_BASE: { path: string; label: string }[] = [
  { path: "inicio", label: "Inicio" },
  { path: "catalogo", label: "Catálogo" },
  { path: "eventos", label: "Eventos" },
  { path: "faq", label: "Preguntas" },
];

/**
 * Cabecera pública: sticky, con carrito, menú móvil, logo/nombre desde el
 * tema/ajustes y CTA de WhatsApp si está configurado.
 */
export function SiteHeader({
  path,
  navigate,
}: {
  path: string;
  navigate: (to: string) => void;
}) {
  const bootstrap = useBootstrapData();
  const items = useCart((s) => s.items);
  const count = cartCount(items);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const brandName = bootstrap?.settings.brandName ?? "Catering con Corazón";
  const logoUrl = bootstrap?.theme.logoUrl ?? null;
  const navItems = bootstrap?.flags.combos_enabled
    ? [NAV_ITEMS_BASE[0]!, NAV_ITEMS_BASE[1]!, { path: "combos", label: "Combos" }, NAV_ITEMS_BASE[2]!, NAV_ITEMS_BASE[3]!]
    : NAV_ITEMS_BASE;

  const wa = bootstrap?.whatsapp;

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a
            href={hashHref("inicio")}
            className="flex min-w-0 items-center gap-2.5"
            aria-label={`${brandName} — ir al inicio`}
            onClick={(e) => {
              e.preventDefault();
              navigate("inicio");
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo de ${brandName}`} className="size-9 rounded-md object-contain" />
            ) : (
              <span
                aria-hidden="true"
              >
                <span className="font-heading text-xl font-bold text-primary">♥</span>
              </span>
            )}
            <span className="truncate font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {brandName}
            </span>
          </a>

          <nav aria-label="Navegación principal" className="ml-6 hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = path === item.path;
              return (
                <a
                  key={item.path}
                  href={hashHref(item.path)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.path);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {wa?.available && wa.waUrl ? (
              <Button
                asChild
                size="sm"
                className="hidden bg-[#25D366] text-[#05231A] hover:bg-[#1eb759] sm:inline-flex"
              >
                <a href={wa.waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {wa.buttonLabel}
                </a>
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="relative gap-2"
              onClick={() => setCartOpen(true)}
              aria-label={`Ver carrito (${count} ${count === 1 ? "artículo" : "artículos"})`}
            >
              <ShoppingBag className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 ? (
                <span
                  className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-foreground"
                  aria-hidden="true"
                >
                  {count}
                </span>
              ) : null}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              aria-expanded={menuOpen}
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {/* Menú móvil */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle className="font-heading">{brandName}</SheetTitle>
          </SheetHeader>
          <nav aria-label="Navegación móvil" className="flex flex-col gap-1 px-4">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={hashHref(item.path)}
                aria-current={path === item.path ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  navigate(item.path);
                }}
                className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                  path === item.path ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onGoToCheckout={() => navigate("carrito")}
      />
    </>
  );
}
