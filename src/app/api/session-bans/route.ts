import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session, SessionBan, SessionMember } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

type Auth = { email: string; role: 'grader' | 'leadership' | 'admin' }

// Bans are managed by the session's creator, or by a global admin.
async function requireSessionOwner(session_id: string, auth: Auth) {
  const session = await Session.findById(session_id).lean()
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  const isOwner = session.created_by?.toLowerCase() === auth.email.toLowerCase()
  if (!isOwner && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only the session creator can manage bans.' }, { status: 403 })
  }
  return session
}

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const session_id = new URL(req.url).searchParams.get('session_id')
  if (!session_id) return NextResponse.json([])

  const owner = await requireSessionOwner(session_id, auth)
  if (owner instanceof NextResponse) return owner

  const bans = await SessionBan.find({ session_id }).sort({ banned_at: -1 }).lean()
  return NextResponse.json(bans.map(b => ({ ...b, id: b._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { session_id, email } = await req.json()
  if (!session_id || !email) {
    return NextResponse.json({ error: 'session_id and email are required.' }, { status: 400 })
  }

  const session = await requireSessionOwner(session_id, auth)
  if (session instanceof NextResponse) return session

  const target = String(email).trim().toLowerCase()
  if (!target.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  // Guard against locking the session's own creator out of it.
  if (target === session.created_by?.toLowerCase()) {
    return NextResponse.json({ error: 'You cannot ban the session creator.' }, { status: 400 })
  }

  await SessionBan.findOneAndUpdate(
    { session_id, email: target },
    { $setOnInsert: { banned_by: auth.email, banned_at: new Date() } },
    { upsert: true },
  )
  // Kick them out if they are currently in the session.
  await SessionMember.deleteOne({ session_id, user_email: target })

  return NextResponse.json({ ok: true, email: target }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { session_id, email } = await req.json()
  if (!session_id || !email) {
    return NextResponse.json({ error: 'session_id and email are required.' }, { status: 400 })
  }

  const owner = await requireSessionOwner(session_id, auth)
  if (owner instanceof NextResponse) return owner

  await SessionBan.deleteOne({ session_id, email: String(email).trim().toLowerCase() })
  return NextResponse.json({ ok: true })
}
