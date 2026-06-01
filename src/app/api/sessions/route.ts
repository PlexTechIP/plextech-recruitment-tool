import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const round_id = searchParams.get('round_id')
  const role = searchParams.get('role')
  const filter: Record<string, string> = {}
  if (round_id) filter.round_id = round_id
  if (role) filter.role = role
  const sessions = await Session.find(filter).sort({ created_at: -1 }).lean()
  return NextResponse.json(sessions.map(s => ({ ...s, id: s._id, _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { id, name, round_id, anonymous, created_by, role } = body
  try {
    if (round_id) {
      const existing = await Session.findOne({ round_id, role: role ?? null, status: 'active' }).lean()
      if (existing) {
        return NextResponse.json(
          { error: 'A deliberation session has already been started for this round and role.' },
          { status: 409 },
        )
      }
    }
    const session = await Session.create({
      _id: id,
      name,
      round_id: round_id ?? null,
      anonymous: anonymous ?? false,
      created_by: created_by ?? auth.email,
      role: role ?? null,
    })
    return NextResponse.json({ ...session.toObject(), id: session._id, _id: undefined }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create session'
    if (message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'A deliberation session has already been started for this round and role.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
