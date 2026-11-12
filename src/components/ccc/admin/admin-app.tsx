"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import {
  BadgePercent,
  Boxes,
  Calculator,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileJson,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Layers,
  LogOut,
  Palette,
  Scale,
  Settings,
  ShoppingCart,
  Tags,
  ToggleRight,
  MessageCircle,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/components/ccc/shared/api-client";
import { useBootstrapData } from "@/components/ccc/shared/use-bootstrap";
import { hashHref } from "@/components/ccc/shared/hash-router";
import { useSession, type SessionUser } from "./session";
import { LoginView, ForceChangePasswordView } from "./login-view";
import { FormField, LoadingBlock } from "./ui-bits";
import DashboardView from "./dashboard-view";
import PosView from "./pos-view";
import OrdersView from "./orders-view";
import InventoryView from "./inventory-view";
import AccountingView from "./accounting-view";
import InvoicesView from "./invoices-view";
import ProductsView from "./products-view";
import CategoriesView from "./categories-view";
import CombosView from "./combos-view";
import DiscountsView from "./discounts-view";
import EventsView from "./events-view";
import AttributeSchemasView from "./attribute-schemas-view";
import UsersView from "./users-view";
import ThemeView from "./theme-view";
import WhatsappView from "./whatsapp-view";
import SettingsView from "./settings-view";
import FlagsView from "./flags-view";
import ContentView from "./content-view";
import LegalAdminView from "./legal-admin-view";

/**
 * Shell del panel de administración (SPA en "#/admin/…" — ADR-002).
 * Módulos por rol (ADR-004) y por flag (ADR-007). El guard de sesión y el
 * cambio de contraseña forzado ocurren ANTES de renderizar cualquier módulo.
 */

type Role = SessionUser["role"];

interface ModuleDef {
  key: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
  /** Flag que activa/desactiva el módulo completo (opcional). */
  flag?: keyof ReturnType<typeof flagsOf>;
  component: ComponentType;
}

function flagsOf(bootstrap: ReturnType<typeof useBootstrapData>) {
  return bootstrap?.flags ?? {
    tax_enabled: false,
    invoicing_enabled: false,
    variants_enabled: false,
    testimonials_enabled: false,
    combos_enabled: true,
    discounts_enabled: true,
  };
}

const MODULES: ModuleDef[] = [
  {
    key: "admin",
    label: "Resumen",
    description: "Métricas del día y del mes",
    icon: LayoutDashboard,
    roles: ["ADMIN", "STAFF", "CONTADOR"],
    component: DashboardView,
  },
  {
    key: "admin/pos",
    label: "Punto de venta",
    description: "Registrar venta en evento (ONSITE)",
    icon: ShoppingCart,
    roles: ["ADMIN", "STAFF"],
    component: PosView,
  },
  {
    key: "admin/orders",
    label: "Pedidos",
    description: "Reservas web y ventas en evento",
    icon: ClipboardList,
    roles: ["ADMIN", "STAFF", "CONTADOR"],
    component: OrdersView,
  },
  {
    key: "admin/inventory",
    label: "Inventario",
    description: "Stock y movimientos",
    icon: Boxes,
    roles: ["ADMIN", "STAFF"],
    component: InventoryView,
  },
  {
    key: "admin/accounting",
    label: "Contabilidad",
    description: "Ingresos y egresos",
    icon: Calculator,
    roles: ["ADMIN", "CONTADOR"],
    component: AccountingView,
  },
  {
    key: "admin/invoices",
    label: "Facturación",
    description: "Facturas internas (flag)",
    icon: FileText,
    roles: ["ADMIN", "CONTADOR"],
    flag: "invoicing_enabled",
    component: InvoicesView,
  },
  {
    key: "admin/products",
    label: "Productos",
    description: "Catálogo, variantes y atributos",
    icon: UtensilsCrossed,
    roles: ["ADMIN"],
    component: ProductsView,
  },
  {
    key: "admin/categories",
    label: "Categorías",
    description: "Agrupaciones de la carta",
    icon: Tags,
    roles: ["ADMIN"],
    component: CategoriesView,
  },
  {
    key: "admin/combos",
    label: "Combos",
    description: "Combos y sus ítems",
    icon: Layers,
    roles: ["ADMIN"],
    flag: "combos_enabled",
    component: CombosView,
  },
  {
    key: "admin/discounts",
    label: "Descuentos",
    description: "Códigos y sus reglas",
    icon: BadgePercent,
    roles: ["ADMIN"],
    flag: "discounts_enabled",
    component: DiscountsView,
  },
  {
    key: "admin/events",
    label: "Eventos",
    description: "Agenda de eventos privados",
    icon: CalendarDays,
    roles: ["ADMIN"],
    component: EventsView,
  },
  {
    key: "admin/schemas",
    label: "Esquemas",
    description: "Esquema de atributos (JSON Schema)",
    icon: FileJson,
    roles: ["ADMIN"],
    component: AttributeSchemasView,
  },
  {
    key: "admin/content",
    label: "Contenido",
    description: "Banners, testimonios y FAQ",
    icon: ImageIcon,
    roles: ["ADMIN"],
    component: ContentView,
  },
  {
    key: "admin/legal",
    label: "Legal",
    description: "Páginas legales editables",
    icon: Scale,
    roles: ["ADMIN"],
    component: LegalAdminView,
  },
  {
    key: "admin/users",
    label: "Usuarios",
    description: "Equipo, roles y accesos",
    icon: Users,
    roles: ["ADMIN"],
    component: UsersView,
  },
  {
    key: "admin/theme",
    label: "Tema",
    description: "Colores, tipografías y logo",
    icon: Palette,
    roles: ["ADMIN"],
    component: ThemeView,
  },
  {
    key: "admin/whatsapp",
    label: "WhatsApp",
    description: "Número y plantilla",
    icon: MessageCircle,
    roles: ["ADMIN"],
    component: WhatsappView,
  },
  {
    key: "admin/settings",
    label: "Ajustes",
    description: "Textos, SEO y negocio",
    icon: Settings,
    roles: ["ADMIN"],
    component: SettingsView,
  },
  {
    key: "admin/flags",
    label: "Flags",
    description: "Módulos activables",
    icon: ToggleRight,
    roles: ["ADMIN"],
    component: FlagsView,
  },
];

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        retry: false,
        body: { currentPassword, newPassword },
      });
      toast.success("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>
            Mínimo 10 caracteres, con letras y números.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Contraseña actual" required error={null}>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Nueva contraseña" required error={error}>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || newPassword.length < 10}>
            {loading ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminApp({
  path,
  navigate,
}: {
  path: string;
  navigate: (to: string) => void;
}) {
  const { user, isLoading, refetch } = useSession();
  const bootstrap = useBootstrapData();
  const flags = flagsOf(bootstrap);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingBlock label="Cargando panel…" />
      </div>
    );
  }
  if (!user) return <LoginView onDone={() => refetch()} />;
  if (user.mustChangePassword) return <ForceChangePasswordView onDone={() => refetch()} />;

  const route = path === "admin" || path === "admin/login" ? "admin" : path;
  const activeModule = MODULES.find((m) => m.key === route) ?? MODULES[0]!;
  const allowed = activeModule.roles.includes(user.role);
  const flagOff = activeModule.flag ? !flags[activeModule.flag] : false;

  const visibleModules = MODULES.filter((m) => m.roles.includes(user.role));

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST", retry: false });
    } finally {
      toast.success("Sesión cerrada");
      refetch();
      navigate("inicio");
    }
  }

  const content: ReactNode = !allowed ? (
    <ForbiddenPanel description={activeModule.description} />
  ) : flagOff ? (
    <FlagOffPanel
      label={activeModule.label}
      flagKey={activeModule.flag ?? ""}
      isAdmin={user.role === "ADMIN"}
    />
  ) : (
    <activeModule.component />
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <a
            href={hashHref("admin")}
            onClick={(e) => {
              e.preventDefault();
              navigate("admin");
            }}
            className="flex items-center gap-2 font-heading text-lg font-bold"
          >
            <span className="text-primary" aria-hidden="true">♥</span>
            <span className="hidden sm:inline">Panel · Catering con Corazón</span>
            <span className="sm:hidden">Panel</span>
          </a>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <a href={hashHref("inicio")}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Ver web
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setPasswordOpen(true)}
              aria-label="Cambiar mi contraseña"
            >
              <KeyRound className="size-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Contraseña</span>
            </Button>
            <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs sm:flex">
              <span className="font-semibold">{user.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{roleLabel(user.role)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav
          aria-label="Módulos del panel"
          className="ccc-scroll -mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-56 lg:flex-col lg:overflow-visible lg:overflow-y-auto lg:px-0 lg:pb-0"
        >
          {visibleModules.map((module) => {
            const active = module.key === activeModule.key;
            const Icon = module.icon;
            const flagInactive = module.flag ? !flags[module.flag] : false;
            return (
              <a
                key={module.key}
                href={hashHref(module.key)}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(module.key);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors lg:w-full ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-card-foreground hover:border-primary/40"
                } ${flagInactive ? "opacity-60" : ""}`}
                title={module.description}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {module.label}
                {flagInactive ? (
                  <span className="ml-auto hidden text-[10px] font-bold uppercase text-muted-foreground lg:inline">
                    off
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 rounded-xl border bg-background p-4 sm:p-6 lg:p-8">
          {content}
        </main>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    ADMIN: "Administrador",
    STAFF: "Staff",
    CONTADOR: "Contador",
  };
  return labels[role];
}

function ForbiddenPanel({ description }: { description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <p className="text-sm font-semibold">Acceso no autorizado</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Tu rol no tiene permisos sobre el módulo «{description}». Si necesitas
        acceso, pide al administrador que actualice tu rol en el módulo Usuarios.
      </p>
    </div>
  );
}

function FlagOffPanel({
  label,
  flagKey,
  isAdmin,
}: {
  label: string;
  flagKey: string;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <ToggleRight className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-semibold">«{label}» está desactivado</p>
      <p className="max-w-md text-sm text-muted-foreground">
        El flag <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{flagKey}</code> está
        apagado; el módulo no se usa hasta activarlo.
        {isAdmin
          ? " Puedes activarlo desde el módulo Flags sin reiniciar nada."
          : " El administrador puede activarlo desde el módulo Flags."}
      </p>
    </div>
  );
}
