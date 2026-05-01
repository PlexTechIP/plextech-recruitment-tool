import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { RecruitmentCycle, EssayPrompt } from '@/lib/models'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const body = await req.json()
  const cycle = await RecruitmentCycle.findByIdAndUpdate(id, body, { new: true }).lean()
  if (!cycle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...cycle, id: cycle._id.toString(), _id: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  await RecruitmentCycle.findByIdAndDelete(id)
  await EssayPrompt.deleteMany({ cycle_id: id })
  return NextResponse.json({ ok: true })
}

// GET prompts for a cycle
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const prompts = await EssayPrompt.find({ cycle_id: id }).sort({ question_number: 1 }).lean()
  return NextResponse.json(prompts.map(p => ({ ...p, id: p._id.toString(), cycle_id: p.cycle_id.toString(), _id: undefined })))
}
