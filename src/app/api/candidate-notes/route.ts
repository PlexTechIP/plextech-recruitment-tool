import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { CandidateNote } from '@/lib/models'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const candidate_id = searchParams.get('candidate_id')
  if (!candidate_id) return NextResponse.json([])
  const notes = await CandidateNote.find({ candidate_id }).sort({ created_at: 1 }).lean()
  return NextResponse.json(notes.map(n => ({ ...n, id: n._id.toString(), candidate_id: n.candidate_id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const note = await CandidateNote.create(body)
  return NextResponse.json({ ...note.toObject(), id: note._id.toString(), _id: undefined }, { status: 201 })
}
