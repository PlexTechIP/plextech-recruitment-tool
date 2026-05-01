import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant, EssayResponse } from '@/lib/models'

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { essays, ...applicantData } = body

  const applicant = await Applicant.create(applicantData)
  const applicantId = applicant._id.toString()

  // Insert essay responses if provided
  if (essays && Array.isArray(essays) && essays.length > 0) {
    const rows = essays.map((e: { prompt_id: string; response: string }) => ({
      applicant_id: applicantId,
      prompt_id: e.prompt_id,
      response: e.response,
    }))
    await EssayResponse.insertMany(rows)
  }

  return NextResponse.json({ id: applicantId }, { status: 201 })
}
