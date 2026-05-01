import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AuthorizedUser } from '@/lib/models'

export async function GET() {
  await connectDB()
  const users = await AuthorizedUser.find().sort({ added_at: 1 }).lean()
  return NextResponse.json(users.map(u => ({ ...u, id: u._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { email, role = 'grader', added_by } = body
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  try {
    const user = await AuthorizedUser.create({ email: email.toLowerCase(), role, added_by })
    return NextResponse.json({ ...user.toObject(), id: user._id.toString(), _id: undefined }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('duplicate')) return NextResponse.json({ error: 'Email already exists.' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
