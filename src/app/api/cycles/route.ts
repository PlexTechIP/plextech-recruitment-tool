import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { RecruitmentCycle } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET() {
  await connectDB()
  await RecruitmentCycle.updateMany(
    { accepting_applications: true, application_deadline: { $lte: new Date() } },
    { $set: { accepting_applications: false } }
  )
  const cycles = await RecruitmentCycle.find().sort({ created_at: -1 }).lean()
  return NextResponse.json(cycles.map(c => ({ ...c, id: c._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { name, status = 'active' } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const cycle = await RecruitmentCycle.create({ name: name.trim(), status })
  return NextResponse.json({ ...cycle.toObject(), id: cycle._id.toString(), _id: undefined }, { status: 201 })
}
