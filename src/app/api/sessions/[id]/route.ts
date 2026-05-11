import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const session = await Session.findById(id).lean()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...session, id: session._id, round_id: session.round_id?.toString() ?? null, _id: undefined })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'anonymous', 'round_id'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  const session = await Session.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...session, id: session._id, round_id: session.round_id?.toString() ?? null, _id: undefined })
}
