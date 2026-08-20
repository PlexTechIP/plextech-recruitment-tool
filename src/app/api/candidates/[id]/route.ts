import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Candidate, Vote, CandidateNote, Session } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  const existing = await Candidate.findById(id).select('session_id').lean()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await Session.findById(existing.session_id).select('created_by status').lean()
  const isOwner = session?.created_by?.toLowerCase() === auth.email.toLowerCase()
  if (!isOwner && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only the session creator can update decisions.' }, { status: 403 })
  }
  if (session?.status !== 'active') {
    return NextResponse.json({ error: 'This session has ended.' }, { status: 409 })
  }

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'data'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  const candidate = await Candidate.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...candidate, id: candidate._id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  // Cascade votes and notes alongside the candidate so they don't orphan.
  await Promise.all([
    Candidate.findByIdAndDelete(id),
    Vote.deleteMany({ candidate_id: id }),
    CandidateNote.deleteMany({ candidate_id: id }),
  ])
  return NextResponse.json({ ok: true })
}
