import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB()
  const { id } = await params
  // Exclude resume_base64 for list views (large field)
  const applicants = await Applicant.find({ cycle_id: id }, { resume_base64: 0 }).sort({ created_at: 1 }).lean()
  return NextResponse.json(applicants.map(a => ({ ...a, id: a._id.toString(), cycle_id: a.cycle_id.toString(), _id: undefined })))
}
