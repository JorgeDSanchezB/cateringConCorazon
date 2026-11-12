import { NextResponse } from "next/server";
import { sessionCookieClear } from "@/lib/auth";
import { apiHandler } from "@/lib/http";

/** POST /api/auth/logout — cierra la sesión (borra cookie). */
export const POST = apiHandler(async () => {
  const response = NextResponse.json({ ok: true });
  sessionCookieClear(response);
  return response;
});
