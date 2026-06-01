import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round, GraderAssignment, Review, Session, Candidate, Vote, CandidateNote, SessionMember } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const round = await Round.findById(id).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'grading_type', 'order_index', 'interview_form_url'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  const round = await Round.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params

  // Cascade: rounds own sessions, sessions own candidates, candidates own votes + notes.
  // We resolve children first so we can wipe descendants by id rather than session/round joins.
  const sessions = await Session.find({ round_id: id }).select('_id').lean()
  const sessionIds = sessions.map(s => s._id)

  const candidates = sessionIds.length
    ? await Candidate.find({ session_id: { $in: sessionIds } }).select('_id').lean()
    : []
  const candidateIds = candidates.map(c => c._id)

  await Promise.all([
    Round.findByIdAndDelete(id),
    GraderAssignment.deleteMany({ round_id: id }),
    Review.deleteMany({ round_id: id }),
    sessionIds.length ? Session.deleteMany({ _id: { $in: sessionIds } }) : Promise.resolve(),
    sessionIds.length ? SessionMember.deleteMany({ session_id: { $in: sessionIds } }) : Promise.resolve(),
    sessionIds.length ? Candidate.deleteMany({ session_id: { $in: sessionIds } }) : Promise.resolve(),
    candidateIds.length ? Vote.deleteMany({ candidate_id: { $in: candidateIds } }) : Promise.resolve(),
    candidateIds.length ? CandidateNote.deleteMany({ candidate_id: { $in: candidateIds } }) : Promise.resolve(),
  ])
  return NextResponse.json({ ok: true })
}
