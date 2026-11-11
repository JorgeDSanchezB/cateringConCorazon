"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage, type ApiOptions } from "@/components/ccc/shared/api-client";

/**
 * Hooks de datos para el admin:
 * - useCursorList: listado paginado por cursor (loadMore + refetch).
 * - useDetail: GET único.
 * - useAdminMutation: POST/PATCH/PUT/DELETE con toast de éxito/error y
 *   invalidación de queries relacionadas.
 */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function buildUrl(endpoint: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(endpoint, "http://localhost"); // base dummy para params
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

export function useCursorList<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  opts: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery<CursorPage<T>>({
    queryKey: [endpoint, params ?? {}],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<CursorPage<T>>(buildUrl(endpoint, { ...(params ?? {}), cursor: pageParam ?? undefined })),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: opts.enabled ?? true,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return {
    ...query,
    items,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => {
      if (query.hasNextPage) query.fetchNextPage();
    },
  };
}

export function useDetail<T>(endpoint: string | null, staleTime = 15_000) {
  return useQuery<T>({
    queryKey: [endpoint],
    queryFn: () => api<T>(endpoint!),
    enabled: endpoint !== null,
    staleTime,
  });
}

export function useAdminMutation<TData, TBody extends ApiOptions["body"]>(
  method: NonNullable<ApiOptions["method"]>,
  endpointOrFn: string | ((body: TBody) => string),
  opts: {
    successMessage?: string;
    invalidate?: unknown[][];
    onDone?: (data: TData) => void;
  } = {},
): UseMutationResult<TData, Error, TBody> {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TBody>({
    mutationFn: (body: TBody) => {
      const endpoint = typeof endpointOrFn === "function" ? endpointOrFn(body) : endpointOrFn;
      return api<TData>(endpoint, { method, body: body ?? undefined });
    },
    onSuccess: (data) => {
      if (opts.successMessage) toast.success(opts.successMessage);
      for (const key of opts.invalidate ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      opts.onDone?.(data);
    },
    onError: (err: Error) => {
      toast.error(apiErrorMessage(err));
    },
  });
}

/** Mutación sin body con URL dinámica (DELETE por id, etc.). */
export function useEndpointMutation<TData, TVar = void>(
  method: NonNullable<ApiOptions["method"]>,
  urlFn: (v: TVar) => string,
  opts: {
    successMessage?: string;
    invalidate?: unknown[][];
    onDone?: (data: TData) => void;
    onSettled?: () => void;
  } = {},
): UseMutationResult<TData, Error, TVar> {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVar>({
    mutationFn: (v: TVar) => api<TData>(urlFn(v), { method, retry: false }),
    onSuccess: (data) => {
      if (opts.successMessage) toast.success(opts.successMessage);
      for (const key of opts.invalidate ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      opts.onDone?.(data);
    },
    onError: (err: Error) => {
      toast.error(apiErrorMessage(err));
    },
    onSettled: () => opts.onSettled?.(),
  });
}

/** Mutación con body dinámico y URL dinámica (p. ej. anular factura). */
export function useBodyMutation<TData, TVar>(
  method: NonNullable<ApiOptions["method"]>,
  urlFn: (v: TVar) => string,
  bodyFn: (v: TVar) => unknown,
  opts: {
    successMessage?: string;
    invalidate?: unknown[][];
    onDone?: (data: TData) => void;
  } = {},
): UseMutationResult<TData, Error, TVar> {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVar>({
    mutationFn: (v: TVar) => api<TData>(urlFn(v), { method, body: bodyFn(v), retry: false }),
    onSuccess: (data) => {
      if (opts.successMessage) toast.success(opts.successMessage);
      for (const key of opts.invalidate ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      opts.onDone?.(data);
    },
    onError: (err: Error) => {
      toast.error(apiErrorMessage(err));
    },
  });
}

/** Mutación simple sin body con URL fija. */
export function useAdminAction<TData>(
  method: NonNullable<ApiOptions["method"]>,
  endpoint: string,
  opts: { successMessage?: string; invalidate?: unknown[][]; onDone?: (data: TData) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, void>({
    mutationFn: () => api<TData>(endpoint, { method, retry: false }),
    onSuccess: (data) => {
      if (opts.successMessage) toast.success(opts.successMessage);
      for (const key of opts.invalidate ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      opts.onDone?.(data);
    },
    onError: (err: Error) => {
      toast.error(apiErrorMessage(err));
    },
  });
}
