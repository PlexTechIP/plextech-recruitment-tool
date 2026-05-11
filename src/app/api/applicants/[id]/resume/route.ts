import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant, GraderAssignment } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params

  // Graders may only access applicants assigned to them; leadership can access anyone
  if (auth.role === 'grader') {
    const assigned = await GraderAssignment.exists({ applicant_id: id, grader_email: auth.email })
    if (!assigned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const applicant = await Applicant.findById(id, { resume_base64: 1 }).lean()
  if (!applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ resume_base64: applicant.resume_base64 ?? null })
}
