import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { EssayPrompt } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const prompts = await EssayPrompt.find({ cycle_id: id }).sort({ question_number: 1 }).lean()
  return NextResponse.json(prompts.map(p => ({ ...p, id: p._id.toString(), cycle_id: p.cycle_id.toString(), _id: undefined })))
}

// Upsert all 3 prompts for a cycle at once
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const prompts: { id?: string; question_number: number; prompt: string; description?: string }[] = await req.json()

  const results = []
  for (const p of prompts) {
    if (p.id) {
      const updated = await EssayPrompt.findByIdAndUpdate(p.id, { prompt: p.prompt, description: p.description ?? null }, { new: true }).lean()
      if (updated) results.push({ ...updated, id: updated._id.toString(), cycle_id: updated.cycle_id.toString(), _id: undefined })
    } else {
      const created = await EssayPrompt.findOneAndUpdate(
        { cycle_id: id, question_number: p.question_number },
        { cycle_id: id, question_number: p.question_number, prompt: p.prompt, description: p.description ?? null },
        { upsert: true, new: true }
      ).lean()
      if (created) results.push({ ...created, id: created._id.toString(), cycle_id: created.cycle_id.toString(), _id: undefined })
    }
  }
  return NextResponse.json(results)
}
