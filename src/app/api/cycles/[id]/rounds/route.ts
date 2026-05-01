import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Round } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const rounds = await Round.find({ cycle_id: id }).sort({ order_index: 1 }).lean()
  return NextResponse.json(rounds.map(r => ({ ...r, id: r._id.toString(), cycle_id: r.cycle_id.toString(), _id: undefined })))
}
