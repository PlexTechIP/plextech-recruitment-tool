import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round, GraderAssignment, Review } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const round = await Round.findById(id).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const body = await req.json()
  const round = await Round.findByIdAndUpdate(id, body, { new: true }).lean()
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...round, id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  await Promise.all([
    Round.findByIdAndDelete(id),
    GraderAssignment.deleteMany({ round_id: id }),
    Review.deleteMany({ round_id: id }),
  ])
  return NextResponse.json({ ok: true })
}
