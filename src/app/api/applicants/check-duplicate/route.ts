import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Applicant } from '@/lib/models'

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
  const existing = await Applicant.exists({ cycle_id, email: emailTrimmed })
  return NextResponse.json({ exists: !!existing })
}
