import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vote, Candidate, SessionMember } from '@/lib/models'
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

  // Require the voter to be a member of the candidate's session — otherwise
  // anyone could vote on candidates from sessions they never joined.
  const candidate = await Candidate.findById(body.candidate_id).lean()
  if (!candidate) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })
  const isMember = await SessionMember.exists({ session_id: candidate.session_id, user_email: auth.email })
  if (!isMember) {
    return NextResponse.json({ error: 'You are not a member of this deliberation session.' }, { status: 403 })
  }

  try {
    const vote = await Vote.create({
      candidate_id: body.candidate_id,
      vote_type: body.vote_type,
      voter_name: String(body.voter_name ?? auth.email).slice(0, 200),
      voter_email: auth.email,
    })
    return NextResponse.json({ id: vote._id.toString() }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('duplicate')) return NextResponse.json({ error: 'You already cast this vote.' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  const vote = await Vote.findById(id).lean()
  if (!vote) return NextResponse.json({ ok: true })

  // Only the voter themselves (or leadership/admin) may delete a vote.
  const isOwner = vote.voter_email && vote.voter_email.toLowerCase() === auth.email.toLowerCase()
  const isPrivileged = auth.role === 'leadership' || auth.role === 'admin'
  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: 'You can only delete your own vote.' }, { status: 403 })
  }

  await Vote.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
