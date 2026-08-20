import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Review, GraderAssignment, Round } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const round_id = searchParams.get('round_id') ?? undefined
  const grader_email = searchParams.get('grader_email') ?? undefined

  // Graders can only fetch their own reviews
  if (auth.role === 'grader' && grader_email && grader_email.toLowerCase() !== auth.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const filter: Record<string, string> = {}
  if (round_id) filter.round_id = round_id
  if (grader_email) filter.grader_email = grader_email.toLowerCase()

  const reviews = await Review.find(filter).lean()
  return NextResponse.json(reviews.map(r => ({
    ...r,
    id: r._id.toString(),
    round_id: r.round_id.toString(),
    applicant_id: r.applicant_id.toString(),
    _id: undefined,
  })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()

  // Enforce that graders can only submit reviews under their own email
  if (body.grader_email && body.grader_email.toLowerCase() !== auth.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!body.round_id || !body.applicant_id) {
    return NextResponse.json({ error: 'round_id and applicant_id are required.' }, { status: 400 })
  }

  // A closed or deliberating round must not accept new grading work, even if a
  // grader still has an old assignment link open.
  const round = await Round.findById(body.round_id).select('status').lean()
  if (!round) return NextResponse.json({ error: 'Round not found.' }, { status: 404 })
  if (round.status !== 'grading') {
    return NextResponse.json({ error: 'This grading round is closed.' }, { status: 409 })
  }

  // Ensure the grader is actually assigned to this applicant for this round —
  // otherwise anyone with grader-level access could poison the score pool.
  const assigned = await GraderAssignment.exists({
    round_id: body.round_id,
    applicant_id: body.applicant_id,
    grader_email: auth.email,
  })
  if (!assigned) {
    return NextResponse.json(
      { error: 'You are not assigned to grade this applicant in this round.' },
      { status: 403 },
    )
  }

  try {
    const review = await Review.create({
      round_id: body.round_id,
      applicant_id: body.applicant_id,
      grader_email: auth.email,
      r0: Number(body.r0), r1: Number(body.r1), r2: Number(body.r2), r3: Number(body.r3),
      r4: Number(body.r4), r5: Number(body.r5), r6: Number(body.r6), r7: Number(body.r7),
      r8: Number(body.r8), r9: Number(body.r9),
      comment0: body.comment0 ?? null, comment1: body.comment1 ?? null,
      comment2: body.comment2 ?? null, comment3: body.comment3 ?? null,
      comment4: body.comment4 ?? null,
    })
    return NextResponse.json({ id: review._id.toString() }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('duplicate')) return NextResponse.json({ error: 'Review already submitted.' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
