import { NextResponse } from 'next/server'

export function GET() {
  // The previous endpoint accepted arbitrary emails and could be used to
  // enumerate applicants. Submission now derives the only queryable email from
  // the verified Google session and handles duplicates atomically.
  return NextResponse.json({ error: 'This endpoint is no longer available.' }, { status: 410 })
}
