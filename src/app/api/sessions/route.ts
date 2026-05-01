import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Session } from '@/lib/models'

export async function GET() {
  await connectDB()
  const sessions = await Session.find().sort({ created_at: -1 }).lean()
  return NextResponse.json(sessions.map(s => ({ ...s, id: s._id, _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { id, ...rest } = body
  const session = await Session.create({ _id: id, ...rest })
  return NextResponse.json({ ...session.toObject(), id: session._id, _id: undefined }, { status: 201 })
}
