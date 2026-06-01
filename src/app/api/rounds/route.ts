import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { cycle_id, name, grading_type, order_index, status, role } = body
  if (!cycle_id || !name?.trim()) return NextResponse.json({ error: 'cycle_id and name required' }, { status: 400 })

  const desiredOrder = order_index ?? 1
  // Conflict is scoped to the same role track — curriculum and developer rounds advance
  // independently, so they can share order_index values.
  const conflict = await Round.findOne({
    cycle_id,
    role: role ?? null,
    order_index: { $gte: desiredOrder },
  }).lean()
  if (conflict) {
    return NextResponse.json(
      { error: 'A round at this position already exists for this role track.' },
      { status: 409 },
    )
  }

  try {
    const round = await Round.create({
      cycle_id,
      name: name.trim(),
      grading_type: grading_type ?? null,
      order_index: desiredOrder,
      status: status ?? 'pending',
      role: role ?? null,
    })
    return NextResponse.json({ ...round.toObject(), id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create round'
    if (message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'A round at this position already exists for this role track.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
