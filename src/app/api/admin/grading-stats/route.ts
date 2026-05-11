import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { GraderAssignment, Review, Applicant } from '@/lib/models'
import { evaluateResults } from '@/lib/scoring'
import { Review as ReviewType, Applicant as ApplicantType } from '@/lib/types'
import { requireRole } from '@/lib/serverAuth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('leadership')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const round_id = searchParams.get('round_id')
  if (!round_id) return NextResponse.json({ error: 'round_id required' }, { status: 400 })

  await connectDB()

  const [assignments, reviews] = await Promise.all([
    GraderAssignment.find({ round_id }).lean(),
    Review.find({ round_id }).lean(),
  ])

  // Grader progress
  const graderMap = new Map<string, { assigned: number; completed: number }>()
  for (const a of assignments) {
    const e = a.grader_email
    if (!graderMap.has(e)) graderMap.set(e, { assigned: 0, completed: 0 })
    graderMap.get(e)!.assigned++
  }
  const reviewedSet = new Set(reviews.map(r => `${r.grader_email}::${r.applicant_id}`))
  for (const a of assignments) {
    if (reviewedSet.has(`${a.grader_email}::${a.applicant_id}`)) {
      graderMap.get(a.grader_email)!.completed++
    }
  }
  const graders = [...graderMap.entries()]
    .map(([email, stats]) => ({ email, ...stats }))
    .sort((a, b) => b.completed - a.completed)

  // Applicant scores
  const applicantIds = [...new Set(assignments.map(a => a.applicant_id.toString()))]
  const applicantDocs = await Applicant.find(
    { _id: { $in: applicantIds } },
    { resume_base64: 0 }
  ).lean()

  const applicants: ApplicantType[] = applicantDocs.map(a => ({
    id: a._id.toString(),
    cycle_id: a.cycle_id.toString(),
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email,
    phone: a.phone,
    year: a.year,
    major: a.major,
    gender: a.gender,
    race: a.race,
    desired_roles: a.desired_roles,
    linkedin: a.linkedin,
    website: a.website,
    time_commitment: a.time_commitment,
    resume_url: null,
    created_at: a.created_at,
  }))

  const reviewsTyped: ReviewType[] = reviews.map(r => ({
    id: r._id.toString(),
    round_id: r.round_id.toString(),
    applicant_id: r.applicant_id.toString(),
    grader_email: r.grader_email,
    r0: r.r0, r1: r.r1, r2: r.r2, r3: r.r3, r4: r.r4,
    r5: r.r5, r6: r.r6, r7: r.r7, r8: r.r8, r9: r.r9,
    comment0: r.comment0, comment1: r.comment1, comment2: r.comment2,
    comment3: r.comment3, comment4: r.comment4,
    submitted_at: r.submitted_at,
  }))

  const scores = evaluateResults(reviewsTyped, applicants)

  const reviewsByApplicant = new Map<string, { grader_email: string; r0: number; r1: number; r2: number; r3: number; r4: number; r5: number; r6: number; r7: number; r8: number; r9: number }[]>()
  for (const r of reviewsTyped) {
    if (!reviewsByApplicant.has(r.applicant_id)) reviewsByApplicant.set(r.applicant_id, [])
    reviewsByApplicant.get(r.applicant_id)!.push({
      grader_email: r.grader_email,
      r0: r.r0 ?? 0, r1: r.r1 ?? 0, r2: r.r2 ?? 0, r3: r.r3 ?? 0, r4: r.r4 ?? 0,
      r5: r.r5 ?? 0, r6: r.r6 ?? 0, r7: r.r7 ?? 0, r8: r.r8 ?? 0, r9: r.r9 ?? 0,
    })
  }

  const applicantRows = scores.map(s => ({
    ...s,
    reviews: reviewsByApplicant.get(s.applicant_id) ?? [],
    review_count: (reviewsByApplicant.get(s.applicant_id) ?? []).length,
    assigned_count: assignments.filter(a => a.applicant_id.toString() === s.applicant_id).length,
  }))

  const scoredIds = new Set(scores.map(s => s.applicant_id))
  for (const a of applicants) {
    if (!scoredIds.has(a.id)) {
      applicantRows.push({
        applicant_id: a.id,
        first_name: a.first_name,
        last_name: a.last_name,
        desired_roles: a.desired_roles ?? null,
        r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0,
        total: 0,
        reviews: [],
        review_count: 0,
        assigned_count: assignments.filter(a2 => a2.applicant_id.toString() === a.id).length,
      })
    }
  }

  return NextResponse.json({ graders, applicants: applicantRows })
}
