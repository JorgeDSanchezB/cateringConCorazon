"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, UserPlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  useAdminMutation,
  useCursorList,
} from "@/components/ccc/admin/data-hooks";
import {
  ErrorBlock,
  FormField,
  LoadingBlock,
  LoadMoreButton,
  STATUS_LABELS,
  StatusBadge,
  ViewHeader,
} from "@/components/ccc/admin/ui-bits";
import { VirtualTable, type Column } from "@/components/ccc/admin/virtual-table";
import { useSiteFormat } from "@/components/ccc/shared/use-bootstrap";
import { ApiError } from "@/components/ccc/shared/api-client";

type Role = "ADMIN" | "STAFF" | "CONTADOR";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface CreateUserResponse extends AdminUser {
  tempPassword?: string | null;
}

/** Debounce sencillo para la búsqueda por texto. */
function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Contraseña copiada al portapapeles.");
  } catch {
    toast.error("No se pudo copiar; cópiela manualmente.");
  }
}

/** Diálogo de contraseña temporal (una sola vez) con botón copiar. */
function TempPasswordDialog({ tempPassword, onClose }: { tempPassword: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contraseña temporal generada</DialogTitle>
          <DialogDescription>
            Se muestra una sola vez: entréguela al usuario por un canal seguro.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="select-all break-all font-mono text-lg font-semibold tracking-wide">
            {tempPassword}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          El usuario deberá cambiarla obligatoriamente en su próximo inicio de sesión.
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => void copyToClipboard(tempPassword)}>
            <Copy className="size-4" aria-hidden />
            Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersView() {
  const fmt = useSiteFormat();

  // Filtros del listado.
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("ALL");
  const debouncedQ = useDebouncedValue(q);

  // Diálogos.
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Formulario de creación.
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<Role>("STAFF");
  const [cPassword, setCPassword] = useState("");
  const [cForce, setCForce] = useState(false);

  // Formulario de edición.
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState<Role>("STAFF");
  const [eActive, setEActive] = useState(true);
  const [eForce, setEForce] = useState(false);

  // Motivo del reset de contraseña.
  const [resetReason, setResetReason] = useState("");

  const list = useCursorList<AdminUser>("/api/admin/users", {
    q: debouncedQ,
    role: role === "ALL" ? undefined : role,
  });

  const createUser = useAdminMutation<CreateUserResponse, {
    name: string;
    email: string;
    role: Role;
    password?: string;
    mustChangePassword?: boolean;
  }>("POST", "/api/admin/users", {
    successMessage: "Usuario creado.",
    invalidate: [["/api/admin/users"]],
    onDone: (data) => {
      setCreateOpen(false);
      if (data.tempPassword) setTempPassword(data.tempPassword);
    },
  });

  const patchUser = useAdminMutation<AdminUser, {
    id: string;
    name?: string;
    email?: string;
    role?: Role;
    isActive?: boolean;
    mustChangePassword?: boolean;
  }>("PATCH", (body) => `/api/admin/users/${body.id}`, {
    invalidate: [["/api/admin/users"]],
    onDone: () => setEditing(null),
  });

  const resetPassword = useAdminMutation<{ ok: boolean; tempPassword: string }, { id: string; reason: string }>(
    "POST",
    (body) => `/api/admin/users/${body.id}/reset-password`,
    {
      invalidate: [["/api/admin/users"]],
      onDone: (data) => {
        setResetUser(null);
        setResetReason("");
        setTempPassword(data.tempPassword);
      },
    },
  );

  function openCreate() {
    setCName("");
    setCEmail("");
    setCRole("STAFF");
    setCPassword("");
    setCForce(false);
    setCreateOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEName(user.name);
    setEEmail(user.email);
    setERole(user.role);
    setEActive(user.isActive);
    setEForce(user.mustChangePassword);
    setEditing(user);
  }

  const fieldErr = (mutation: { error: unknown }, field: string) =>
    mutation.error instanceof ApiError ? mutation.error.fieldMessage(field) : null;

  const submitCreate = () => {
    createUser.mutate({
      name: cName.trim(),
      email: cEmail.trim(),
      role: cRole,
      // Contraseña vacía → el servidor genera una temporal.
      ...(cPassword.trim() !== "" ? { password: cPassword } : {}),
      mustChangePassword: cForce,
    });
  };

  const submitEdit = () => {
    if (!editing) return;
    patchUser.mutate({
      id: editing.id,
      name: eName.trim(),
      email: eEmail.trim(),
      role: eRole,
      isActive: eActive,
      mustChangePassword: eForce,
    });
  };

  const columns: Column<AdminUser>[] = [
    { key: "name", header: "Nombre", width: "1.1fr", render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "email", header: "Email", width: "1.5fr", render: (u) => <span className="text-muted-foreground">{u.email}</span> },
    { key: "role", header: "Rol", width: "120px", render: (u) => <StatusBadge status={u.role} /> },
    {
      key: "isActive",
      header: "Activo",
      width: "70px",
      align: "center",
      render: (u) => (
        <Switch
          checked={u.isActive}
          disabled={patchUser.isPending}
          aria-label={`Activar o desactivar a ${u.name}`}
          onCheckedChange={(v) => patchUser.mutate({ id: u.id, isActive: v })}
        />
      ),
    },
    {
      key: "mustChange",
      header: "Cambio forzado",
      width: "130px",
      render: (u) =>
        u.mustChangePassword ? (
          <Badge variant="outline" className="whitespace-nowrap border-amber-200 bg-amber-50 text-amber-900">
            Debe cambiar
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "lastLogin",
      header: "Último acceso",
      width: "150px",
      render: (u) => <span className="text-muted-foreground">{u.lastLoginAt ? fmt.datetime(u.lastLoginAt) : "Nunca"}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      width: "180px",
      render: (u) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!u.isActive || resetPassword.isPending}
            onClick={() => {
              setResetReason("");
              setResetUser(u);
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            Reset
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Usuarios"
        description="Cuentas de acceso al panel: administradores, staff de evento y contabilidad."
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="size-4" aria-hidden />
            Nuevo usuario
          </Button>
        }
      />

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:max-w-xs"
          aria-label="Buscar usuario"
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" aria-label="Filtrar por rol">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los roles</SelectItem>
            <SelectItem value="ADMIN">Administrador</SelectItem>
            <SelectItem value="STAFF">Staff</SelectItem>
            <SelectItem value="CONTADOR">Contador</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Listado */}
      {list.isLoading ? (
        <LoadingBlock label="Cargando usuarios…" />
      ) : list.isError ? (
        <ErrorBlock message="No se pudo cargar la lista de usuarios." onRetry={() => void list.refetch()} />
      ) : (
        <div className="space-y-3">
          <VirtualTable
            rows={list.items}
            columns={columns}
            rowKey={(u) => u.id}
            emptyMessage="Sin usuarios que coincidan con el filtro."
          />
          <LoadMoreButton onClick={list.loadMore} disabled={!list.hasMore} loading={list.isFetchingNextPage} />
        </div>
      )}

      {/* Diálogo de creación */}
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              La contraseña es opcional: si la dejas vacía se genera una temporal que se muestra una sola vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Nombre" required error={fieldErr(createUser, "name")}>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
            </FormField>
            <FormField label="Email" required error={fieldErr(createUser, "email")}>
              <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
            </FormField>
            <FormField label="Rol" required error={fieldErr(createUser, "role")}>
              <Select value={cRole} onValueChange={(v) => setCRole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as Role[])
                    .filter((r) => r === "ADMIN" || r === "STAFF" || r === "CONTADOR")
                    .map((r) => (
                      <SelectItem key={r} value={r}>
                        {STATUS_LABELS[r]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Contraseña"
              error={fieldErr(createUser, "password")}
              hint="Mínimo 10 caracteres con letras y números. Si la dejas vacía se genera una temporal."
            >
              <Input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="c-force">Forzar cambio de contraseña</Label>
                <p className="text-xs text-muted-foreground">
                  Debe cambiarla en su primer inicio de sesión.
                </p>
              </div>
              <Switch id="c-force" checked={cForce} onCheckedChange={setCForce} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createUser.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={createUser.isPending || cName.trim() === "" || cEmail.trim() === ""}>
              Crear usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de edición */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Nombre" required error={fieldErr(patchUser, "name")}>
              <Input value={eName} onChange={(e) => setEName(e.target.value)} />
            </FormField>
            <FormField label="Email" required error={fieldErr(patchUser, "email")}>
              <Input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
            </FormField>
            <FormField label="Rol" required error={fieldErr(patchUser, "role")}>
              <Select value={eRole} onValueChange={(v) => setERole(v as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="CONTADOR">Contador</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="e-active">Usuario activo</Label>
                <p className="text-xs text-muted-foreground">Los desactivados no pueden iniciar sesión.</p>
              </div>
              <Switch id="e-active" checked={eActive} onCheckedChange={setEActive} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="e-force">Forzar cambio de contraseña</Label>
                <p className="text-xs text-muted-foreground">Se exigirá en el próximo inicio de sesión.</p>
              </div>
              <Switch id="e-force" checked={eForce} onCheckedChange={setEForce} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={patchUser.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} disabled={patchUser.isPending || eName.trim() === "" || eEmail.trim() === ""}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de reset de contraseña */}
      <AlertDialog open={resetUser !== null} onOpenChange={(v) => !v && setResetUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará una contraseña temporal para <strong>{resetUser?.name}</strong> que se
              mostrará una sola vez. Indique el motivo (queda registrado en auditoría).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reset-reason">Motivo</Label>
            <Input
              id="reset-reason"
              placeholder="Ej: solicitud del usuario"
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
            />
            {resetPassword.error instanceof ApiError && resetPassword.error.fieldMessage("reason") ? (
              <p className="text-xs text-destructive" role="alert">
                {resetPassword.error.fieldMessage("reason")}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPassword.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetPassword.isPending || resetReason.trim().length < 3}
              onClick={(e) => {
                e.preventDefault(); // Mantener abierto hasta resolver la mutación.
                if (resetUser) resetPassword.mutate({ id: resetUser.id, reason: resetReason.trim() });
              }}
            >
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contraseña temporal (creación o reset) */}
      {tempPassword !== null ? (
        <TempPasswordDialog tempPassword={tempPassword} onClose={() => setTempPassword(null)} />
      ) : null}
    </div>
  );
}
