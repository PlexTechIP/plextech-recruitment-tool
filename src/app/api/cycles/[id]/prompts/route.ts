import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { EssayPrompt } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Public — used by the apply portal
  await connectDB()
  const { id } = await params
  const prompts = await EssayPrompt.find({ cycle_id: id }).sort({ question_number: 1 }).lean()
  return NextResponse.json(prompts.map(p => ({ ...p, id: p._id.toString(), cycle_id: p.cycle_id.toString(), _id: undefined })))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  const prompts: { id?: string; question_number: number; prompt: string; description?: string; criterion1?: string; criterion2?: string }[] = await req.json()

  const results = []
  for (const p of prompts) {
    const fields = {
      prompt: String(p.prompt ?? '').slice(0, 2000),
      description: p.description ? String(p.description).slice(0, 2000) : null,
      criterion1: p.criterion1 ? String(p.criterion1).slice(0, 500) : null,
      criterion2: p.criterion2 ? String(p.criterion2).slice(0, 500) : null,
    }
    if (p.id) {
      const updated = await EssayPrompt.findByIdAndUpdate(p.id, fields, { new: true }).lean()
      if (updated) results.push({ ...updated, id: updated._id.toString(), cycle_id: updated.cycle_id.toString(), _id: undefined })
    } else {
      const created = await EssayPrompt.findOneAndUpdate(
        { cycle_id: id, question_number: p.question_number },
        { cycle_id: id, question_number: p.question_number, ...fields },
        { upsert: true, new: true }
      ).lean()
      if (created) results.push({ ...created, id: created._id.toString(), cycle_id: created.cycle_id.toString(), _id: undefined })
    }
  }
  return NextResponse.json(results)
}
