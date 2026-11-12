"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/components/ccc/shared/api-client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "CONTADOR";
  mustChangePassword: boolean;
}

interface MeResponse {
  user: SessionUser;
}

/** Sesión actual (null si no hay sesión o expiró). */
export function useSession(): {
  user: SessionUser | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useQuery<MeResponse | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        return await api<MeResponse>("/api/auth/me");
      } catch {
        return null; // 401 u otro error → sin sesión
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  return { user: data?.user ?? null, isLoading, refetch };
}
