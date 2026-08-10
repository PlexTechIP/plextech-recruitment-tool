import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SessionMember, SessionBan } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  if (!session_id) return NextResponse.json([])
  const members = await SessionMember.find({ session_id }).lean()
  return NextResponse.json(members.map(m => ({ ...m, id: m._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { session_id, user_email } = body
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  // Graders can only join as themselves; leadership can add any email
  const emailToAdd = (auth.role === 'grader' || !user_email)
    ? auth.email
    : String(user_email).toLowerCase()

  // Banned emails cannot (re)join, no matter who is adding them.
  const banned = await SessionBan.exists({ session_id, email: emailToAdd })
  if (banned) {
    return NextResponse.json(
      { error: 'This email is banned from the session.' },
      { status: 403 },
    )
  }

  await SessionMember.findOneAndUpdate(
    { session_id, user_email: emailToAdd },
    { $setOnInsert: { joined_at: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { session_id, user_email } = await req.json()

  // Graders can only remove themselves; leadership can remove anyone
  const emailToRemove = String(user_email ?? '').toLowerCase()
  if (auth.role === 'grader' && emailToRemove !== auth.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await SessionMember.deleteOne({ session_id, user_email: emailToRemove })
  return NextResponse.json({ ok: true })
}
