import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant, EssayResponse, EssayPrompt, GraderAssignment, Candidate, SessionMember } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('grader')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const { id } = await params

  // Graders may only access applicants assigned to them; leadership can access anyone
  // Graders may access an applicant if assigned to grade them, OR if they are a
  // member of a deliberation session that includes this applicant (so deliberators
  // can read essays). Leadership+ can access anyone.
  if (auth.role === 'grader') {
    const assigned = await GraderAssignment.exists({ applicant_id: id, grader_email: auth.email })
    if (!assigned) {
      const sessionIds = await Candidate.find({ applicant_id: id }).distinct('session_id')
      const isMember = sessionIds.length > 0 && await SessionMember.exists({ session_id: { $in: sessionIds }, user_email: auth.email })
      if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const [applicantDoc, responses] = await Promise.all([
    Applicant.findById(id, { resume_base64: 0 }).lean(),
    EssayResponse.find({ applicant_id: id }).lean(),
  ])

  if (!applicantDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const applicant = { ...applicantDoc, id: applicantDoc._id.toString(), cycle_id: applicantDoc.cycle_id.toString(), _id: undefined }

  const promptIds = responses.map(r => r.prompt_id)
  const prompts = await EssayPrompt.find({ _id: { $in: promptIds } }).sort({ question_number: 1 }).lean()

  const essays = prompts.map(p => {
    const r = responses.find(r => r.prompt_id.toString() === p._id.toString())
    return {
      prompt: { id: p._id.toString(), cycle_id: p.cycle_id.toString(), question_number: p.question_number, prompt: p.prompt, description: p.description, criterion1: p.criterion1 ?? null, criterion2: p.criterion2 ?? null },
      response: r?.response ?? '',
    }
  })

  return NextResponse.json({ applicant, essays })
}
