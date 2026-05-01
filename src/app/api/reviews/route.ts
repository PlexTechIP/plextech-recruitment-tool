import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Review } from '@/lib/models'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const round_id = searchParams.get('round_id')
  const grader_email = searchParams.get('grader_email')

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
  await connectDB()
  const body = await req.json()
  try {
    const review = await Review.create({
      ...body,
      grader_email: body.grader_email?.toLowerCase(),
    })
    return NextResponse.json({ id: review._id.toString() }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('duplicate')) return NextResponse.json({ error: 'Review already submitted.' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
