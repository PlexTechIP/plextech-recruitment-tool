import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vote } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const candidate_ids = searchParams.get('candidate_ids')?.split(',').filter(Boolean) ?? []
  if (!candidate_ids.length) return NextResponse.json([])
  const votes = await Vote.find({ candidate_id: { $in: candidate_ids } }).lean()
  return NextResponse.json(votes.map(v => ({ ...v, id: v._id.toString(), candidate_id: v.candidate_id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const validTypes = ['vouch', 'anti_vouch', 'red_flag']
  if (!body.candidate_id || !body.vote_type || !validTypes.includes(body.vote_type)) {
    return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 })
  }

  const vote = await Vote.create({
    candidate_id: body.candidate_id,
    vote_type: body.vote_type,
    voter_name: String(body.voter_name ?? auth.email).slice(0, 200),
  })
  return NextResponse.json({ id: vote._id.toString() }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await req.json()
  await Vote.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
