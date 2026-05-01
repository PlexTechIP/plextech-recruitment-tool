import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vote } from '@/lib/models'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const candidate_ids = searchParams.get('candidate_ids')?.split(',').filter(Boolean) ?? []
  if (!candidate_ids.length) return NextResponse.json([])
  const votes = await Vote.find({ candidate_id: { $in: candidate_ids } }).lean()
  return NextResponse.json(votes.map(v => ({ ...v, id: v._id.toString(), candidate_id: v.candidate_id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const vote = await Vote.create(body)
  return NextResponse.json({ id: vote._id.toString() }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  await connectDB()
  const { id } = await req.json()
  await Vote.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
