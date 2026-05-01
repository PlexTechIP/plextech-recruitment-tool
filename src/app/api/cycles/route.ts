import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { RecruitmentCycle } from '@/lib/models'

export async function GET() {
  await connectDB()
  const cycles = await RecruitmentCycle.find().sort({ created_at: -1 }).lean()
  return NextResponse.json(cycles.map(c => ({ ...c, id: c._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const cycle = await RecruitmentCycle.create(body)
  return NextResponse.json({ ...cycle.toObject(), id: cycle._id.toString(), _id: undefined }, { status: 201 })
}
