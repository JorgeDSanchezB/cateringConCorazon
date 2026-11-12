"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";

/**
 * CTA de WhatsApp: flotante en móvil y escritorio (junto al CTA del header).
 * Tolerancia: si el admin no ha configurado número válido, el botón NO se
 * rompe — abre un aviso claro con degradación (no rompe el flujo del cliente).
 */
export function WhatsAppFab() {
  const bootstrap = useBootstrapData();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const available = bootstrap?.whatsapp.available ?? false;
  const waUrl = bootstrap?.whatsapp.waUrl ?? null;
  const label = bootstrap?.whatsapp.buttonLabel ?? "Reservar por WhatsApp";

  if (available && waUrl) {
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} (abre WhatsApp en una pestaña nueva)`}
        title={label}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-[#05231A] theme-shadow transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300"
      >
        <MessageCircle className="size-7" aria-hidden="true" />
      </a>
    );
  }

  // Fallback claro: número no configurado (el admin lo ve en su módulo).
  return (
    <>
      <button
        type="button"
        onClick={() => setNoticeOpen(true)}
        aria-label="Contacto por WhatsApp no disponible temporalmente"
        title="WhatsApp no disponible"
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground theme-shadow"
      >
        <MessageCircle className="size-7" aria-hidden="true" />
      </button>

      {noticeOpen ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Aviso de contacto"
          className="fixed bottom-24 right-5 z-50 w-[19rem] rounded-xl border bg-card p-4 text-card-foreground theme-shadow"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">WhatsApp no disponible por ahora</p>
            <button
              type="button"
              onClick={() => setNoticeOpen(false)}
              aria-label="Cerrar aviso"
              className="rounded p-1 hover:bg-muted"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Puedes armar tu pedido en el carrito y enviarlo; nos pondremos en contacto
            contigo para confirmarlo. El administrador puede configurar el número en el
            panel (Módulo WhatsApp).
          </p>
        </div>
      ) : null}
    </>
  );
}
