import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant } from '@/lib/models'

// Returns just the base64 resume for the grader view
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  const applicant = await Applicant.findById(id, { resume_base64: 1 }).lean()
  if (!applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ resume_base64: applicant.resume_base64 ?? null })
}
