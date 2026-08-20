import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import { Applicant, Candidate, CoffeeChatNote, Round, Session, SessionMember } from '@/lib/models'
import { normalizePersonName } from '@/lib/coffeeChats'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  const candidateId = new URL(req.url).searchParams.get('candidate_id') ?? ''
  if (!mongoose.isValidObjectId(candidateId)) {
    return NextResponse.json({ error: 'A valid candidate_id is required.' }, { status: 400 })
  }

  await connectDB()
  const candidate = await Candidate.findById(candidateId).select('applicant_id session_id name').lean()
  if (!candidate) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })

  const session = await Session.findById(candidate.session_id).select('round_id').lean()
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })

  const isMember = await SessionMember.exists({
    session_id: candidate.session_id,
    user_email: auth.email.toLowerCase(),
  })
  if (!isMember) return NextResponse.json({ error: 'Join this session to view coffee-chat notes.' }, { status: 403 })

  let applicantId = candidate.applicant_id?.toString() ?? null
  if (!applicantId && session.round_id) {
    const round = await Round.findById(session.round_id).select('cycle_id').lean()
    if (round) {
      const applicants = await Applicant.find({ cycle_id: round.cycle_id }).select('first_name last_name').lean()
      const candidateName = normalizePersonName(candidate.name)
      const matches = applicants.filter(applicant =>
        normalizePersonName(`${applicant.first_name} ${applicant.last_name}`) === candidateName,
      )
      if (matches.length === 1) applicantId = matches[0]._id.toString()
    }
  }
  if (!applicantId) return NextResponse.json([])

  const notes = await CoffeeChatNote.find({ applicant_id: applicantId }).lean()
  notes.sort((a, b) => {
    if (!a.chat_date && b.chat_date) return 1
    if (a.chat_date && !b.chat_date) return -1
    return String(a.chat_date ?? '').localeCompare(String(b.chat_date ?? '')) ||
      a.imported_at.getTime() - b.imported_at.getTime()
  })

  return NextResponse.json(notes.map(note => ({
    ...note,
    id: note._id.toString(),
    cycle_id: note.cycle_id.toString(),
    applicant_id: note.applicant_id.toString(),
    _id: undefined,
  })))
}
