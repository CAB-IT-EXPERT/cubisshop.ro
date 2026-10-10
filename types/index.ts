export type UserRole = 'admin' | 'manager' | 'user';
export type PlatformAccess = 'desktop' | 'mobile' | 'both';

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  platform_access: PlatformAccess;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AppUser;
}
