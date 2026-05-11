import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { cycle_id, name, grading_type, order_index, status } = body
  if (!cycle_id || !name?.trim()) return NextResponse.json({ error: 'cycle_id and name required' }, { status: 400 })

  const round = await Round.create({ cycle_id, name: name.trim(), grading_type: grading_type ?? null, order_index: order_index ?? 1, status: status ?? 'pending' })
  return NextResponse.json({ ...round.toObject(), id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined }, { status: 201 })
}
