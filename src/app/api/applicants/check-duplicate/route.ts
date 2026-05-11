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

  await connectDB()
  const existing = await Applicant.exists({ cycle_id, email: email.trim().toLowerCase() })
  return NextResponse.json({ exists: !!existing })
}
