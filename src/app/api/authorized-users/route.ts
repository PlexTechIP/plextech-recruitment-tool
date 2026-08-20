import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AuthorizedUser } from '@/lib/models'
import { requireRole } from '@/lib/serverAuth'

export async function GET() {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const users = await AuthorizedUser.find().sort({ added_at: 1 }).lean()
  return NextResponse.json(users.map(u => ({ ...u, id: u._id.toString(), _id: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  await connectDB()
  const body = await req.json()
  const { email, role = 'grader' } = body
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const validRoles = ['grader', 'leadership', 'admin']
  if (!validRoles.includes(role)) return NextResponse.json({ error: 'invalid role' }, { status: 400 })

  try {
    const user = await AuthorizedUser.create({ email: email.toLowerCase(), role, added_by: auth.email })
    return NextResponse.json({ ...user.toObject(), id: user._id.toString(), _id: undefined }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('duplicate')) return NextResponse.json({ error: 'Email already exists.' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
