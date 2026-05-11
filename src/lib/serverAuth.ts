import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/authOptions'

type Role = 'grader' | 'leadership' | 'admin'

interface AuthedSession {
  email: string
  role: Role
}

// Returns the session user, or a 401 NextResponse if not authenticated.
// Usage: const auth = await requireAuth(); if (auth instanceof NextResponse) return auth;
export async function requireAuth(): Promise<AuthedSession | NextResponse> {
  const session = await getServerSession(authOptions)
  const user = session?.user as ({ email?: string | null; role?: Role }) | undefined
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { email: user.email, role: user.role ?? 'grader' }
}

// Like requireAuth but also enforces a minimum role.
// Role hierarchy: grader < leadership < admin
const ROLE_RANK: Record<Role, number> = { grader: 0, leadership: 1, admin: 2 }

export async function requireRole(minRole: Role): Promise<AuthedSession | NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  if (ROLE_RANK[auth.role] < ROLE_RANK[minRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return auth
}
