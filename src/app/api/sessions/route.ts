import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET() {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const sessions = await Session.find().sort({ created_at: -1 }).lean()
  return NextResponse.json(sessions.map(s => ({ ...s, id: s._id, _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { id, name, round_id, anonymous } = body
  const session = await Session.create({ _id: id, name, round_id: round_id ?? null, anonymous: anonymous ?? false })
  return NextResponse.json({ ...session.toObject(), id: session._id, _id: undefined }, { status: 201 })
}
