import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { GraderAssignment } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { searchParams } = new URL(req.url)
  const round_id = searchParams.get('round_id') ?? undefined
  let grader_email = searchParams.get('grader_email') ?? undefined

  // Graders can only fetch their own assignments
  if (auth.role === 'grader' && grader_email && grader_email.toLowerCase() !== auth.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (auth.role === 'grader') grader_email = auth.email

  const filter: Record<string, string> = {}
  if (round_id) filter.round_id = round_id
  if (grader_email) filter.grader_email = grader_email.toLowerCase()

  const assignments = await GraderAssignment.find(filter).lean()
  return NextResponse.json(assignments.map(a => ({
    ...a,
    id: a._id.toString(),
    round_id: a.round_id.toString(),
    applicant_id: a.applicant_id.toString(),
    _id: undefined,
  })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const rows: { round_id: string; applicant_id: string; grader_email: string }[] = await req.json()
  if (!Array.isArray(rows)) return NextResponse.json({ error: 'Expected array' }, { status: 400 })

  const ops = rows.map(r => ({
    updateOne: {
      filter: { round_id: r.round_id, applicant_id: r.applicant_id, grader_email: r.grader_email.toLowerCase() },
      update: { $setOnInsert: { assigned_at: new Date() } },
      upsert: true,
    },
  }))
  await GraderAssignment.bulkWrite(ops)
  return NextResponse.json({ ok: true })
}
