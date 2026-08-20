import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AuthorizedUser } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()
  const validRoles = ['grader', 'leadership', 'admin']
  if (body.role && !validRoles.includes(body.role)) return NextResponse.json({ error: 'invalid role' }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  if (body.role) allowed.role = body.role
  if (body.email) allowed.email = String(body.email).toLowerCase()

  const user = await AuthorizedUser.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...user, id: user._id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  await AuthorizedUser.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
