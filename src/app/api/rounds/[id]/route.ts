import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round, GraderAssignment, Review } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const round = await Round.findById(id).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'grading_type', 'order_index', 'interview_form_url'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  const round = await Round.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  await Promise.all([
    Round.findByIdAndDelete(id),
    GraderAssignment.deleteMany({ round_id: id }),
    Review.deleteMany({ round_id: id }),
  ])
  return NextResponse.json({ ok: true })
}
