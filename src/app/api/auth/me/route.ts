import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonOk, apiHandler } from "@/lib/http";

/** GET /api/auth/me — usuario de la sesión actual (permite pendiente de cambio de contraseña). */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser(req, { allowPendingPassword: true });
  return jsonOk({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
});
