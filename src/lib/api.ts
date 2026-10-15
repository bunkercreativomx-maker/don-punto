import { pb } from './pocketbase';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** POST a /api/* con la sesión del usuario (los endpoints validan token + membresía) */
export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token || '' },
    body: JSON.stringify(body ?? {}),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ApiError(data?.error || 'No se pudo conectar con el servidor. Intenta de nuevo.', res.status, data?.code);
  return data as T;
}
