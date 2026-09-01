import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose from 'mongoose'
import { Applicant, GraderAssignment, Round } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'
import { isObjectId } from '@/lib/apiValidation'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params
  if (!isObjectId(id)) return NextResponse.json({ error: 'Invalid applicant id.' }, { status: 400 })

  // Graders may only access applicants assigned to them; leadership can access anyone
  if (auth.role === 'grader') {
    const assignments = await GraderAssignment.find({ applicant_id: id, grader_email: auth.email }).select('round_id').lean()
    const roundIds = assignments.map(assignment => assignment.round_id)
    const activeRound = roundIds.length
      ? await Round.exists({ _id: mongoose.trusted({ $in: roundIds }), status: 'grading' })
      : null
    if (!activeRound) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The global sanitizeProjection setting intentionally prevents callers from
  // overriding select:false fields. This server-authored query is the single
  // audited exception that may retrieve the private resume payload.
  const applicant = await Applicant.findById(id)
    .sanitizeProjection(false)
    .select('+resume_base64')
    .lean()
  if (!applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(
    { resume_base64: applicant.resume_base64 ?? null },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
