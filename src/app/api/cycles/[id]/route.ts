import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { RecruitmentCycle, EssayPrompt } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const body = await req.json()

  // Whitelist only patchable fields
  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'status', 'accepting_applications', 'application_deadline'] as const
  for (const f of fields) if (f in body) allowed[f] = body[f]

  const cycle = await RecruitmentCycle.findByIdAndUpdate(id, allowed, { new: true }).lean()
  if (!cycle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...cycle, id: cycle._id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  await RecruitmentCycle.findByIdAndDelete(id)
  await EssayPrompt.deleteMany({ cycle_id: id })
  return NextResponse.json({ ok: true })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const prompts = await EssayPrompt.find({ cycle_id: id }).sort({ question_number: 1 }).lean()
  return NextResponse.json(prompts.map(p => ({ ...p, id: p._id.toString(), cycle_id: p.cycle_id.toString(), _id: undefined })))
}
