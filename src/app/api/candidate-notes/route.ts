import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { CandidateNote, Candidate, SessionMember, Session as SessionModel } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const candidate_id = searchParams.get('candidate_id')
  if (!candidate_id) return NextResponse.json([])
  const notes = await CandidateNote.find({ candidate_id }).sort({ created_at: 1 }).lean()

  // Red-flag notes are anonymous to everyone but the session creator; authors
  // still see their own. Redacted server-side so the name never reaches the client.
  // Defaults to false (more anonymous) if the lookup fails for any reason.
  let isCreator = false
  try {
    const candidate = await Candidate.findById(candidate_id).select('session_id').lean()
    const session = candidate ? await SessionModel.findById(candidate.session_id).select('created_by').lean() : null
    isCreator = !!session && session.created_by?.toLowerCase() === auth.email.toLowerCase()
  } catch { /* keep isCreator = false */ }

  return NextResponse.json(notes.map(n => {
    const base = { ...n, id: n._id.toString(), candidate_id: n.candidate_id.toString(), _id: undefined }
    const isMine = !!n.author_email && n.author_email.toLowerCase() === auth.email.toLowerCase()
    if (n.type === 'red_flag' && !isCreator && !isMine) {
      return { ...base, author: 'Anonymous' }
    }
    return base
  }))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const validTypes = ['note', 'red_flag']
  if (!body.candidate_id || !body.content || !validTypes.includes(body.type)) {
    return NextResponse.json({ error: 'Invalid note data' }, { status: 400 })
  }

  // Match votes: only session members may leave notes on a candidate.
  const candidate = await Candidate.findById(body.candidate_id).lean()
  if (!candidate) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })
  const isMember = await SessionMember.exists({ session_id: candidate.session_id, user_email: auth.email })
  if (!isMember) {
    return NextResponse.json({ error: 'You are not a member of this deliberation session.' }, { status: 403 })
  }

  const note = await CandidateNote.create({
    candidate_id: body.candidate_id,
    author: String(body.author ?? auth.email).slice(0, 200),
    author_email: auth.email,
    content: String(body.content).slice(0, 2000),
    type: body.type,
  })
  return NextResponse.json({ ...note.toObject(), id: note._id.toString(), _id: undefined }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only allow deletion by the note's author or leadership/admin. Ownership is
  // keyed on author_email — `author` holds a display name, not an identity.
  const note = await CandidateNote.findById(id).lean()
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isAuthor = !!note.author_email && note.author_email.toLowerCase() === auth.email.toLowerCase()
  if (!isAuthor && auth.role === 'grader') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await CandidateNote.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
