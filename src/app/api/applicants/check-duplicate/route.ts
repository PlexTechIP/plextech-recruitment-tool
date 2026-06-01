import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant, RecruitmentCycle } from '@/lib/models'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cycle_id = searchParams.get('cycle_id')
  const email = searchParams.get('email')

  if (!cycle_id || !email) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Basic format validation to prevent probing with arbitrary values
  const emailTrimmed = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return NextResponse.json({ exists: false })
  }
  if (!/^[a-f\d]{24}$/i.test(cycle_id)) {
    return NextResponse.json({ exists: false })
  }

  await connectDB()

  // Only confirm existence for cycles currently accepting applications. This
  // narrows enumeration to the active application window where the user could
  // legitimately know about the cycle anyway.
  const cycle = await RecruitmentCycle.findById(cycle_id).lean()
  if (!cycle || cycle.status !== 'active' || !cycle.accepting_applications) {
    return NextResponse.json({ exists: false })
  }

  const existing = await Applicant.exists({ cycle_id, email: emailTrimmed })
  return NextResponse.json({ exists: !!existing })
}
