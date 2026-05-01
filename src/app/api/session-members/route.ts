import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SessionMember } from '@/lib/models'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  if (!session_id) return NextResponse.json([])
  const members = await SessionMember.find({ session_id }).lean()
  return NextResponse.json(members.map(m => ({ ...m, id: m._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { session_id, user_email } = body
  await SessionMember.findOneAndUpdate(
    { session_id, user_email: user_email.toLowerCase() },
    { $setOnInsert: { joined_at: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  await connectDB()
  const { session_id, user_email } = await req.json()
  await SessionMember.deleteOne({ session_id, user_email: user_email.toLowerCase() })
  return NextResponse.json({ ok: true })
}
