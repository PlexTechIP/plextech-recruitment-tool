import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round } from '@/lib/models'

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const round = await Round.create(body)
  return NextResponse.json({ ...round.toObject(), id: round._id.toString(), cycle_id: round.cycle_id.toString(), _id: undefined }, { status: 201 })
}
