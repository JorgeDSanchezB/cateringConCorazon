"use client";

import { useState } from "react";
import { KeyRound, Lock, LogIn, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { FormField } from "./ui-bits";
import { hashHref } from "@/components/ccc/shared/hash-router";

/**
 * Login del panel (credenciales + cookie httpOnly; JWT del servidor).
 * Distingue: credenciales inválidas (401), usuario desactivado (403),
 * rate limit (429) y errores de red — mensajes claros, sin filtrar detalles.
 */
export function LoginView({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await api("/api/auth/login", {
        method: "POST",
        retry: false,
        body: { email: email.trim().toLowerCase(), password },
      });
      toast.success("Sesión iniciada");
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem.errors?.length) {
          const byField: Record<string, string> = {};
          for (const fe of err.problem.errors) byField[fe.field] = fe.message;
          setFieldErrors(byField);
        }
        setError(err.problem.detail);
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-card-foreground theme-shadow">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Lock className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Panel interno</h1>
          <p className="text-sm text-muted-foreground">
            Catering con Corazón — acceso del equipo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField label="Email" required error={fieldErrors.email ?? null}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="usuario@cateringconcorazon.ec"
              required
            />
          </FormField>
          <FormField label="Contraseña" required error={fieldErrors.password ?? null}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </FormField>

          {error ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            <LogIn className="size-4" aria-hidden="true" />
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <a
            href={hashHref("inicio")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Volver a la web pública
          </a>
        </p>
      </div>
    </div>
  );
}

/**
 * Cambio de contraseña forzado (mustChangePassword tras reset del admin).
 * La sesión técnica es válida, pero el panel no se abre hasta cambiarla.
 */
export function ForceChangePasswordView({
  onDone,
}: {
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "Las contraseñas no coinciden." });
      return;
    }
    setLoading(true);
    setFieldErrors({});
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        retry: false,
        body: { currentPassword, newPassword },
      });
      toast.success("Contraseña actualizada. Ya puedes usar el panel.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors?.length) {
        const byField: Record<string, string> = {};
        for (const fe of err.problem.errors) byField[fe.field] = fe.message;
        setFieldErrors(byField);
      } else {
        toast.error(apiErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-card-foreground theme-shadow">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-xl font-bold">Cambia tu contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Por seguridad debes establecer una contraseña nueva antes de continuar
            (mínimo 10 caracteres, con letras y números).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField label="Contraseña actual" required error={fieldErrors.currentPassword ?? null}>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </FormField>
          <FormField label="Nueva contraseña" required error={fieldErrors.newPassword ?? null}>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
          <FormField label="Repite la nueva contraseña" required error={fieldErrors.confirm ?? null}>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Guardando…" : "Guardar y continuar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
