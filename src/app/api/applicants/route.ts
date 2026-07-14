import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant, EssayResponse, RecruitmentCycle } from '@/lib/models'

const VALID_RACES = [
  'American Indian or Alaska Native',
  'Asian (including Indian subcontinent and Philippines origin)',
  'Black or African American',
  'White',
  'Hispanic or Latino',
  'Middle Eastern',
  'Native American or Other Pacific Islander',
  'Prefer not to answer',
]
const VALID_ROLES = ['Curriculum Student', 'Industry Developer']

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { essays } = body

  // Whitelist and validate all applicant fields
  const email = String(body.email ?? '').trim().toLowerCase()
  const first_name = String(body.first_name ?? '').trim().slice(0, 100)
  const last_name = String(body.last_name ?? '').trim().slice(0, 100)
  const phone = String(body.phone ?? '').trim().slice(0, 30)
  const VALID_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']
  const year = VALID_YEARS.includes(body.year) ? body.year : ''
  const transfer = body.transfer === true
  const major = String(body.major ?? '').trim().slice(0, 200)
  const gender = String(body.gender ?? '').trim().slice(0, 100)
  const race: string[] = Array.isArray(body.race)
    ? body.race.filter((r: unknown) => typeof r === 'string' && VALID_RACES.includes(r))
    : []
  const desired_roles = String(body.desired_roles ?? '').trim()
  const linkedin = body.linkedin ? String(body.linkedin).trim().slice(0, 500) : null
  const website = body.website ? String(body.website).trim().slice(0, 500) : null
  const time_commitment = String(body.time_commitment ?? '').trim().slice(0, 3000)
  const resume_base64 = typeof body.resume_base64 === 'string' ? body.resume_base64 : null
  const cycle_id = String(body.cycle_id ?? '').trim()

  if (!email || !first_name || !last_name || !cycle_id) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(desired_roles)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  // Enforce that the cycle is actively accepting applications and the deadline (if set) hasn't passed.
  // This route is intentionally unauthenticated (applicants don't have accounts), so the window check
  // is the only guard against spam / out-of-window submissions.
  let cycle
  try {
    cycle = await RecruitmentCycle.findById(cycle_id).lean()
  } catch {
    return NextResponse.json({ error: 'Invalid cycle.' }, { status: 400 })
  }
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })
  if (cycle.status !== 'active' || !cycle.accepting_applications) {
    return NextResponse.json({ error: 'This cycle is not accepting applications.' }, { status: 403 })
  }
  if (cycle.application_deadline && new Date(cycle.application_deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: 'The application deadline has passed.' }, { status: 403 })
  }

  const existing = await Applicant.findOne({ cycle_id, email })
  if (existing) {
    return NextResponse.json({ error: 'An application with this email already exists for this cycle.' }, { status: 409 })
  }

  const applicant = await Applicant.create({
    cycle_id, first_name, last_name, email, phone, year, transfer, major, gender,
    race, desired_roles, linkedin, website, time_commitment, resume_base64,
  })
  const applicantId = applicant._id.toString()

  if (essays && Array.isArray(essays) && essays.length > 0) {
    const rows = essays
      .filter((e: unknown) => e && typeof e === 'object' && 'prompt_id' in (e as object))
      .map((e: { prompt_id: string; response: string }) => ({
        applicant_id: applicantId,
        prompt_id: e.prompt_id,
        response: String(e.response ?? '').slice(0, 6000),
      }))
    if (rows.length > 0) await EssayResponse.insertMany(rows)
  }

  return NextResponse.json({ id: applicantId }, { status: 201 })
}
