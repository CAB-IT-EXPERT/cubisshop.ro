import type { AppUser, LoginResponse, PlatformAccess, UserRole } from '@/types';

const CRM_API_URL = 'https://cubisshop.ro/shop-api/crm/api.php';

export type MobileAppUpdateInfo = {
  platform: 'android';
  current_version: string;
  available_version: string;
  update_available: boolean;
  download_url: string;
  release_notes?: string;
  message?: string;
};

export interface AppUserPayload {
  username: string;
  display_name: string;
  password?: string;
  role: UserRole;
  platform_access: PlatformAccess;
  is_active: boolean;
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export function isAuthenticationApiError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

async function call<T>(
  action: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(CRM_API_URL);
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), method === 'GET' ? 12000 : 30000);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: any) {
    throw new ApiRequestError(error?.name === 'AbortError'
      ? 'API-ul Cubis Shop nu a răspuns la timp.'
      : 'API-ul Cubis Shop nu poate fi contactat.');
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiRequestError(`API-ul Cubis Shop nu a returnat JSON valid (HTTP ${response.status}).`, response.status);
  }
  if (!response.ok) throw new ApiRequestError(payload.error || `HTTP ${response.status}`, response.status);
  return payload as T;
}

export function loginAppUser(
  username: string,
  password: string,
  platform: 'desktop' | 'mobile' = 'mobile',
  rememberMe = false
) {
  return call<LoginResponse>('login', 'POST', {
    username,
    password,
    platform,
    remember_me: rememberMe ? 1 : 0,
  });
}

export function logoutAppUser(authToken: string) {
  return call<{ success: boolean }>('logout', 'POST', { auth_token: authToken });
}

export function getCurrentAppUser(authToken: string) {
  return call<AppUser>('getCurrentUser', 'GET', undefined, { authToken });
}

export function updateOwnProfile(authToken: string, payload: { display_name: string; password?: string }) {
  return call<AppUser>('updateOwnProfile', 'PUT', { ...payload, auth_token: authToken });
}

export function getMobileAppUpdate(currentVersion: string) {
  return call<MobileAppUpdateInfo>('getMobileAppUpdate', 'GET', undefined, {
    currentVersion,
    platform: 'android',
    cacheBust: String(Date.now()),
  });
}

export function getAppUsers(authToken: string) {
  return call<AppUser[]>('getUsers', 'GET', undefined, { authToken, cacheBust: String(Date.now()) });
}

export function createAppUser(authToken: string, payload: AppUserPayload) {
  return call<AppUser>('createUser', 'POST', {
    ...payload,
    auth_token: authToken,
    is_active: payload.is_active ? 1 : 0,
  });
}

export function updateAppUser(authToken: string, id: string, payload: AppUserPayload) {
  return call<AppUser>('updateUser', 'PUT', {
    ...payload,
    auth_token: authToken,
    is_active: payload.is_active ? 1 : 0,
  }, { id });
}

export async function deleteAppUser(authToken: string, id: string) {
  await call<{ success: boolean }>('deleteUser', 'DELETE', { auth_token: authToken, id }, { id });
}
