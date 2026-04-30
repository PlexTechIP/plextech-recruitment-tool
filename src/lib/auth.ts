import { supabase } from './supabase'
import { UserRole } from './types'

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data } = await supabase
    .from('authorized_users')
    .select('role')
    .ilike('email', user.email)
    .maybeSingle()

  if (!data) return null

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
    role: data.role as UserRole,
  }
}

export function canCreateSession(role: UserRole): boolean {
  return role === 'admin' || role === 'leadership'
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin'
}

export function canAccessAdmin(role: UserRole): boolean {
  return role === 'admin'
}
