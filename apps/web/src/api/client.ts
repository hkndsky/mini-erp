import axios, { AxiosError } from 'axios';

/**
 * Thin axios wrapper. The token lives in localStorage (this is an internal
 * ops tool, not public-facing; a memory-only token would log users out on
 * every refresh which is worse than the storage trade-off).
 */
export const TOKEN_KEY = 'erp.accessToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (e.g. jsdom in some setups) — ignore */
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      setToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(normalizeError(error));
  },
);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function normalizeError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 0;
  const body = error.response?.data as { message?: string | string[] } | undefined;
  let message: string;
  if (body?.message) {
    message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  } else if (error.code === 'ERR_NETWORK') {
    message = 'Cannot reach the API. Is the backend running?';
  } else {
    message = error.message || `Request failed (${status})`;
  }
  return new ApiError(status, message, body);
}
