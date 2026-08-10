import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session, Candidate, Vote, CandidateNote, SessionMember, SessionBan } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const session = await Session.findById(id).lean()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Banned users can't open the session at all.
  const banned = await SessionBan.exists({ session_id: id, email: auth.email })
  if (banned) {
    return NextResponse.json({ error: 'You have been removed from this session.' }, { status: 403 })
  }

  return NextResponse.json({ ...session, id: session._id, round_id: session.round_id?.toString() ?? null, _id: undefined })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'anonymous', 'round_id', 'role'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  // Validate role if provided — only the two enum values or null make sense.
  if ('role' in allowed && allowed.role !== null && allowed.role !== 'curriculum' && allowed.role !== 'developer') {
    return NextResponse.json({ error: 'role must be "curriculum", "developer", or null.' }, { status: 400 })
  }

  try {
    const session = await Session.findByIdAndUpdate(id, allowed, { new: true }).lean()
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ...session, id: session._id, round_id: session.round_id?.toString() ?? null, _id: undefined })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update session'
    if (msg.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'Another active session already has this role for this round.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params

  // Cascade: session owns candidates owns votes + notes; session also owns members.
  const candidates = await Candidate.find({ session_id: id }).select('_id').lean()
  const candidateIds = candidates.map(c => c._id)
  await Promise.all([
    Session.findByIdAndDelete(id),
    SessionMember.deleteMany({ session_id: id }),
    SessionBan.deleteMany({ session_id: id }),
    Candidate.deleteMany({ session_id: id }),
    candidateIds.length ? Vote.deleteMany({ candidate_id: { $in: candidateIds } }) : Promise.resolve(),
    candidateIds.length ? CandidateNote.deleteMany({ candidate_id: { $in: candidateIds } }) : Promise.resolve(),
  ])
  return NextResponse.json({ ok: true })
}
