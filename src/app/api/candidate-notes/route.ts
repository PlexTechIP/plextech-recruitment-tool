import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { CandidateNote } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const candidate_id = searchParams.get('candidate_id')
  if (!candidate_id) return NextResponse.json([])
  const notes = await CandidateNote.find({ candidate_id }).sort({ created_at: 1 }).lean()
  return NextResponse.json(notes.map(n => ({ ...n, id: n._id.toString(), candidate_id: n.candidate_id.toString(), _id: undefined })))
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

  const note = await CandidateNote.create({
    candidate_id: body.candidate_id,
    author: String(body.author ?? auth.email).slice(0, 200),
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

  // Only allow deletion by the note's author or leadership/admin
  const note = await CandidateNote.findById(id).lean()
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.author !== auth.email && auth.role === 'grader') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await CandidateNote.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
