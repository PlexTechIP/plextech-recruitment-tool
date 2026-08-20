import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import { Applicant, CoffeeChatNote, RecruitmentCycle } from '@/lib/models'
import { parseAndMatchCoffeeChatCsv, MAX_COFFEE_CHAT_CSV_BYTES } from '@/lib/coffeeChats'
import { requireRole } from '@/lib/serverAuth'

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => null)
  const cycleId = typeof body?.cycle_id === 'string' ? body.cycle_id : ''
  const csvText = typeof body?.csv_text === 'string' ? body.csv_text : ''
  const action = body?.action === 'commit' ? 'commit' : 'preview'

  if (!mongoose.isValidObjectId(cycleId)) {
    return NextResponse.json({ error: 'A valid cycle_id is required.' }, { status: 400 })
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'CSV text is required.' }, { status: 400 })
  }
  if (Buffer.byteLength(csvText, 'utf8') > MAX_COFFEE_CHAT_CSV_BYTES) {
    return NextResponse.json({ error: 'CSV exceeds the 2 MB limit.' }, { status: 413 })
  }

  await connectDB()
  const cycleExists = await RecruitmentCycle.exists({ _id: cycleId })
  if (!cycleExists) return NextResponse.json({ error: 'Recruitment cycle not found.' }, { status: 404 })

  const applicants = await Applicant.find({ cycle_id: cycleId })
    .select('first_name last_name')
    .lean()
  const preview = parseAndMatchCoffeeChatCsv(csvText, applicants.map(applicant => ({
    id: applicant._id.toString(),
    first_name: applicant.first_name,
    last_name: applicant.last_name,
  })))

  if (preview.coffee_chat_rows === 0) {
    return NextResponse.json(
      { error: 'The CSV contains no rows marked as coffee chats.', preview },
      { status: 422 },
    )
  }
  if (preview.issues.length > 0) {
    return NextResponse.json(
      { error: 'Every coffee-chat row must match exactly one applicant before import.', preview },
      { status: 422 },
    )
  }

  if (action === 'preview') return NextResponse.json({ preview })

  const importedAt = new Date()
  await mongoose.connection.transaction(async session => {
    await CoffeeChatNote.deleteMany({ cycle_id: cycleId }, { session })
    await CoffeeChatNote.insertMany(
      preview.matched_rows.map(row => ({
        cycle_id: cycleId,
        applicant_id: row.applicant_id,
        applicant_name: row.applicant_name,
        chatter_name: row.chatter_name,
        notes: row.notes,
        chat_date: row.chat_date,
        other_notes: row.other_notes,
        imported_by: auth.email,
        imported_at: importedAt,
      })),
      { session },
    )
  })

  return NextResponse.json({
    ok: true,
    imported: preview.matched_rows.length,
    applicants: new Set(preview.matched_rows.map(row => row.applicant_id)).size,
  })
}
