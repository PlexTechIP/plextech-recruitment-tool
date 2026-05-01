import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Candidate } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const candidates = await Candidate.find({ session_id: id }).sort({ created_at: 1 }).lean()
  return NextResponse.json(candidates.map(c => ({
    ...c,
    id: c._id.toString(),
    applicant_id: c.applicant_id?.toString() ?? null,
    _id: undefined,
  })))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const body = await req.json()
  const rows = Array.isArray(body) ? body : [body]
  const created = await Candidate.insertMany(rows.map(r => ({ ...r, session_id: id })))
  return NextResponse.json(created.map(c => ({ ...c.toObject(), id: c._id.toString(), _id: undefined })), { status: 201 })
}
