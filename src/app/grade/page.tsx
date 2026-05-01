'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, CurrentUser } from '@/lib/auth'
import { Applicant, EssayPrompt, Round } from '@/lib/types'

// Rubric sections tied to r-values and scoring.ts weights
// Essay index 0 → r4, r5, comment1
// Essay index 1 → r8, r9, comment2
// Essay index 2 → r6, r7, comment3
const ESSAY_RUBRIC = [
  {
    label: 'Question 1',
    commentKey: 'comment1',
    ratings: [
      { key: 'r4', question: 'To what degree does the applicant demonstrate passion for the club specifically?' },
      { key: 'r5', question: 'To what extent does the applicant exhibit knowledge about the club (culture, people, projects, etc.)?' },
    ],
  },
  {
    label: 'Question 2',
    commentKey: 'comment2',
    ratings: [
      { key: 'r8', question: 'To what degree does the applicant demonstrate leadership skills in their community?' },
      { key: 'r9', question: 'How well does the applicant show commitment to their community?' },
    ],
  },
  {
    label: 'Question 3',
    commentKey: 'comment3',
    ratings: [
      { key: 'r6', question: 'To what degree does the applicant demonstrate creativity in their solution?' },
      { key: 'r7', question: 'To what extent does their response demonstrate an eagerness to learn or explore?' },
    ],
  },
]

type RKey = 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | 'r7' | 'r8' | 'r9'
type CKey = 'comment0' | 'comment1' | 'comment2' | 'comment3' | 'comment4'

interface ApplicantFull extends Applicant {
  essays: { prompt: EssayPrompt; response: string }[]
  resumeBase64: string | null
}

interface RoundSummary {
  round: Round
  total: number
  completed: number
}

function defaultRatings(): Record<RKey, string> {
  return { r0: '', r1: '', r2: '', r3: '', r4: '', r5: '', r6: '', r7: '', r8: '', r9: '' }
}

function defaultComments(): Record<CKey, string> {
  return { comment0: '', comment1: '', comment2: '', comment3: '', comment4: '' }
}

export default function GradePage() {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [roundSummaries, setRoundSummaries] = useState<RoundSummary[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [queue, setQueue] = useState<ApplicantFull[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [totalAssigned, setTotalAssigned] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [ratings, setRatings] = useState<Record<RKey, string>>(defaultRatings())
  const [comments, setComments] = useState<Record<CKey, string>>(defaultComments())
  const [essayConfirmed, setEssayConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingRounds, setLoadingRounds] = useState(true)
  const [loadingQueue, setLoadingQueue] = useState(false)
  const resumeRef = useRef<HTMLDivElement>(null)

  // Auth
  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u) { router.replace('/'); return }
      setUser(u)
    })
  }, [router])

  // Scroll to resume section when essay confirmed
  useEffect(() => {
    if (essayConfirmed) resumeRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [essayConfirmed])

  // Load round summaries whenever user is set
  useEffect(() => {
    if (!user) return
    loadRoundSummaries(user.email)
  }, [user])

  async function loadRoundSummaries(graderEmail: string) {
    setLoadingRounds(true)

    // All assignments for this grader
    const assignments: { round_id: string; applicant_id: string }[] = await fetch(
      `/api/grader-assignments?grader_email=${encodeURIComponent(graderEmail)}`
    ).then(r => r.json())

    if (!assignments?.length) {
      setRoundSummaries([])
      setLoadingRounds(false)
      return
    }

    // All reviews already submitted by this grader
    const reviews: { round_id: string; applicant_id: string }[] = await fetch(
      `/api/reviews?grader_email=${encodeURIComponent(graderEmail)}`
    ).then(r => r.json())

    const reviewedSet = new Set(
      (reviews ?? []).map(r => `${r.round_id}::${r.applicant_id}`)
    )

    // Group by round
    const roundMap = new Map<string, { total: number; completed: number }>()
    for (const a of assignments) {
      if (!roundMap.has(a.round_id)) roundMap.set(a.round_id, { total: 0, completed: 0 })
      const entry = roundMap.get(a.round_id)!
      entry.total++
      if (reviewedSet.has(`${a.round_id}::${a.applicant_id}`)) entry.completed++
    }

    // Load round details individually
    const roundIds = [...roundMap.keys()]
    const roundResults = await Promise.all(
      roundIds.map(id => fetch(`/api/rounds/${id}`).then(r => r.ok ? r.json() : null))
    )
    const rounds = roundResults.filter(Boolean) as Round[]
    rounds.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const summaries: RoundSummary[] = rounds.map(r => ({
      round: r,
      total: roundMap.get(r.id)!.total,
      completed: roundMap.get(r.id)!.completed,
    }))

    setRoundSummaries(summaries)

    // Auto-select if only one round with pending work
    const pending = summaries.filter(s => s.completed < s.total)
    if (pending.length === 1) {
      setSelectedRoundId(pending[0].round.id)
    }

    setLoadingRounds(false)
  }

  // Load queue when round is selected
  useEffect(() => {
    if (!selectedRoundId || !user) return
    loadQueue(selectedRoundId, user.email)
  }, [selectedRoundId, user])

  async function loadQueue(roundId: string, graderEmail: string) {
    setLoadingQueue(true)
    setQueueIndex(0)
    setEssayConfirmed(false)
    setRatings(defaultRatings())
    setComments(defaultComments())

    // Get assigned applicant IDs for this round
    const assignments: { applicant_id: string }[] = await fetch(
      `/api/grader-assignments?round_id=${roundId}&grader_email=${encodeURIComponent(graderEmail)}`
    ).then(r => r.json())

    const assignedIds = (assignments ?? []).map(a => a.applicant_id)
    setTotalAssigned(assignedIds.length)

    // Get already-reviewed applicant IDs
    const reviews: { applicant_id: string }[] = await fetch(
      `/api/reviews?round_id=${roundId}&grader_email=${encodeURIComponent(graderEmail)}`
    ).then(r => r.json())

    const reviewedIds = new Set((reviews ?? []).map(r => r.applicant_id))
    setCompletedCount(reviewedIds.size)

    const pendingIds = assignedIds.filter(id => !reviewedIds.has(id))

    if (pendingIds.length === 0) {
      setQueue([])
      setLoadingQueue(false)
      return
    }

    // Load essays+prompts for each pending applicant
    const fullQueue: ApplicantFull[] = await Promise.all(
      pendingIds.map(async (applicantId) => {
        const [essayData, resumeData] = await Promise.all([
          fetch(`/api/applicants/${applicantId}/essays`).then(r => r.ok ? r.json() : null),
          fetch(`/api/applicants/${applicantId}/resume`).then(r => r.ok ? r.json() : null),
        ])

        // essayData shape: { applicant: Applicant, essays: { prompt: EssayPrompt, response: string }[] }
        const applicant: Applicant = essayData?.applicant ?? { id: applicantId }
        const essays: { prompt: EssayPrompt; response: string }[] = essayData?.essays ?? []
        const resumeBase64: string | null = resumeData?.resume_base64 ?? null

        return { ...applicant, essays, resumeBase64 }
      })
    )

    setQueue(fullQueue)
    setLoadingQueue(false)
  }

  function setRating(key: RKey, value: string) {
    setRatings(prev => ({ ...prev, [key]: value }))
  }

  function setComment(key: CKey, value: string) {
    setComments(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!user || !selectedRoundId) return
    const applicant = queue[queueIndex]
    if (!applicant) return

    setSubmitting(true)
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        round_id: selectedRoundId,
        applicant_id: applicant.id,
        grader_email: user.email,
        r0: Number(ratings.r0),
        r1: Number(ratings.r1),
        r2: Number(ratings.r2),
        r3: Number(ratings.r3),
        r4: Number(ratings.r4),
        r5: Number(ratings.r5),
        r6: Number(ratings.r6),
        r7: Number(ratings.r7),
        r8: Number(ratings.r8),
        r9: Number(ratings.r9),
        comment0: comments.comment0 || null,
        comment1: comments.comment1 || null,
        comment2: comments.comment2 || null,
        comment3: comments.comment3 || null,
        comment4: comments.comment4 || null,
      }),
    })

    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json()
      alert('Submission failed: ' + (err.error ?? res.statusText))
      return
    }

    setCompletedCount(c => c + 1)
    setEssayConfirmed(false)
    setRatings(defaultRatings())
    setComments(defaultComments())
    window.scrollTo(0, 0)

    if (queueIndex + 1 >= queue.length) {
      setQueue([])
    } else {
      setQueueIndex(i => i + 1)
    }
  }

  const applicant = queue[queueIndex] ?? null
  const progress = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0

  // ─── Render states ───────────────────────────────────────────

  if (!user) return null

  // Round selection screen
  if (!selectedRoundId) {
    return (
      <main className="min-h-screen bg-[var(--bg-base)] p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Grading Queue</h1>
            <button
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              onClick={() => router.push('/dashboard')}
            >
              ← Dashboard
            </button>
          </div>

          {loadingRounds ? (
            <p className="text-[var(--text-muted)]">Loading your assignments…</p>
          ) : roundSummaries.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8 text-center">
              <p className="text-[var(--text-muted)]">You have no applicants assigned yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {roundSummaries.map(({ round, total, completed }) => {
                const pending = total - completed
                return (
                  <button
                    key={round.id}
                    onClick={() => setSelectedRoundId(round.id)}
                    disabled={pending === 0}
                    className="w-full text-left bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 hover:bg-[var(--bg-raised)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{round.name}</p>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                          {pending > 0 ? `${pending} applicant${pending !== 1 ? 's' : ''} remaining` : 'All done!'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-[#ff8a00]">{completed}/{total}</p>
                        <p className="text-xs text-[var(--text-muted)]">completed</p>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mt-3 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#ff8a00] rounded-full transition-all"
                          style={{ width: `${Math.round((completed / total) * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </main>
    )
  }

  // Loading queue
  if (loadingQueue) {
    return (
      <main className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading applicants…</p>
      </main>
    )
  }

  // All done for this round
  if (!applicant) {
    return (
      <main className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-3xl font-bold text-[var(--text-primary)]">All done!</p>
          <p className="text-[var(--text-muted)]">You have reviewed all {totalAssigned} assigned applicants for this round.</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-[#ff8a00] text-white font-medium hover:opacity-90 transition-opacity"
            onClick={() => { setSelectedRoundId(null); loadRoundSummaries(user.email) }}
          >
            Back to Rounds
          </button>
        </div>
      </main>
    )
  }

  // ─── Grading form ─────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[var(--bg-base)] py-8 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">PlexTech Grader Portal</h1>
          <button
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            onClick={() => { setSelectedRoundId(null); loadRoundSummaries(user.email) }}
          >
            ← Rounds
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-[var(--text-muted)]">Reviews completed: {completedCount} / {totalAssigned}</p>
            <p className="text-sm text-[var(--text-muted)]">{progress}%</p>
          </div>
          <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ff8a00] rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            For each applicant, refer to the rubric for assigning ratings and leave concise comments for every response.
          </p>
        </div>

        <div className="space-y-5">

          {/* Applicant metadata */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <Field label="Graduation Year" value={applicant.year ?? 'N/A'} />
            <Field label="Major" value={applicant.major ?? 'N/A'} />
            <Field label="Desired Role" value={applicant.desired_roles ?? 'Not specified'} />
            {essayConfirmed && (
              <>
                {applicant.linkedin && <Field label="LinkedIn" value={applicant.linkedin} />}
                {applicant.website && <Field label="Personal Website" value={applicant.website} />}
              </>
            )}
          </div>

          {/* Essay stage */}
          {!essayConfirmed && (
            <>
              {applicant.essays.slice(0, 3).map((e, i) => {
                const rubric = ESSAY_RUBRIC[i]
                if (!rubric) return null
                return (
                  <Section key={e.prompt.id} label={rubric.label}>
                    <p className="text-sm font-medium text-[#ff8a00] mb-1">{e.prompt.prompt}</p>
                    <div className="bg-[var(--bg-raised)] rounded-lg p-3 mb-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                      {e.response || <span className="text-[var(--text-muted)] italic">No response</span>}
                    </div>
                    <CommentField
                      label="Comment"
                      value={comments[rubric.commentKey as CKey]}
                      onChange={v => setComment(rubric.commentKey as CKey, v)}
                    />
                    {rubric.ratings.map(r => (
                      <RatingSelect
                        key={r.key}
                        question={r.question}
                        value={ratings[r.key as RKey]}
                        onChange={v => setRating(r.key as RKey, v)}
                        options={[1, 2, 3, 4]}
                      />
                    ))}
                  </Section>
                )
              })}

              {/* Time commitments */}
              <Section label="Time Commitments">
                <div className="bg-[var(--bg-raised)] rounded-lg p-3 mb-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                  {applicant.time_commitment || <span className="text-[var(--text-muted)] italic">None provided</span>}
                </div>
                <CommentField
                  label="Comment"
                  value={comments.comment4}
                  onChange={v => setComment('comment4', v)}
                />
                <RatingSelect
                  question="Do the applicant's time commitments seem concerning (WAY too many clubs, insane unit count, etc.)?"
                  value={ratings.r0}
                  onChange={v => setRating('r0', v)}
                  options={[
                    { value: '3', label: 'Not at all' },
                    { value: '2', label: 'Could be a problem' },
                    { value: '1', label: 'RED FLAG' },
                  ]}
                />
              </Section>

              {/* Confirm essay reviews */}
              {(() => {
                const emptyComments = ESSAY_RUBRIC.map((r) => ({
                  label: r.label,
                  empty: !comments[r.commentKey as CKey].trim(),
                })).concat([{ label: 'Time Commitments', empty: !comments.comment4.trim() }]).filter(c => c.empty)
                const essayRatingKeys: RKey[] = ['r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r0']
                const emptyRatings = essayRatingKeys.filter(k => !ratings[k])
                const canConfirm = emptyComments.length === 0 && emptyRatings.length === 0
                return (
                  <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-sm text-[var(--text-muted)] mb-3">
                      Please confirm your essay reviews before moving on. You cannot edit your current responses beyond this point.
                    </p>
                    {emptyComments.length > 0 && (
                      <p className="text-xs text-amber-500 mb-2">
                        Missing comments for: {emptyComments.map(c => c.label).join(', ')}
                      </p>
                    )}
                    {emptyRatings.length > 0 && (
                      <p className="text-xs text-amber-500 mb-3">
                        Please select a rating for all questions
                      </p>
                    )}
                    <button
                      className="px-4 py-2 rounded-lg bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-active)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => setEssayConfirmed(true)}
                      disabled={!canConfirm}
                    >
                      Confirm Essay Reviews →
                    </button>
                  </div>
                )
              })()}
            </>
          )}

          {/* Resume stage */}
          <div ref={resumeRef} />
          {essayConfirmed && (
            <>
              <Section label="Resume / CV">
                {applicant.resumeBase64 ? (
                  <iframe
                    src={`data:application/pdf;base64,${applicant.resumeBase64}`}
                    className="w-full rounded-lg border border-[var(--border)]"
                    style={{ height: '70vh' }}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)] italic">No resume uploaded.</p>
                )}
                <div className="mt-4 space-y-4">
                  <CommentField
                    label="Comment"
                    value={comments.comment0}
                    onChange={v => setComment('comment0', v)}
                  />
                  <RatingSelect
                    question="How thoughtful and expressive are the explanations in their resume?"
                    value={ratings.r1}
                    onChange={v => setRating('r1', v)}
                    options={[1, 2, 3, 4]}
                  />
                  <RatingSelect
                    question="What is the technical depth demonstrated in the resume?"
                    value={ratings.r2}
                    onChange={v => setRating('r2', v)}
                    options={[1, 2, 3, 4]}
                  />
                  <RatingSelect
                    question="To what degree is the applicant's passion for learning and building shown in their resume?"
                    value={ratings.r3}
                    onChange={v => setRating('r3', v)}
                    options={[1, 2, 3, 4]}
                  />
                </div>
              </Section>

              {(() => {
                const resumeRatingKeys: RKey[] = ['r1', 'r2', 'r3']
                const missingResumeRatings = resumeRatingKeys.some(k => !ratings[k])
                const missingResumeComment = !comments.comment0.trim()
                const canSubmit = !missingResumeComment && !missingResumeRatings
                return (
                  <div className="pb-12 space-y-2">
                    {missingResumeComment && (
                      <p className="text-xs text-amber-500">Missing comment for Resume / CV</p>
                    )}
                    {missingResumeRatings && (
                      <p className="text-xs text-amber-500">Please select a rating for all resume questions</p>
                    )}
                    <button
                      className="w-full py-3 rounded-lg bg-[#ff8a00] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleSubmit}
                      disabled={submitting || !canSubmit}
                    >
                      {submitting ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

// ─── Small reusable sub-components ───────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 items-start">
      <span className="text-sm text-[var(--text-muted)] w-36 shrink-0">{label}</span>
      <span className="text-sm text-[var(--text-secondary)]">{value}</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-[#ff8a00]">{label}</h3>
      {children}
    </div>
  )
}

function CommentField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[var(--text-muted)]">{label}</label>
      <textarea
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)] text-sm p-2 resize-y focus:outline-none focus:border-[#ff8a00] transition-colors"
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

type RatingOption = number | { value: string; label: string }

function RatingSelect({
  question, value, onChange, options,
}: {
  question: string
  value: string
  onChange: (v: string) => void
  options: RatingOption[]
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[var(--text-secondary)]">{question}</label>
      <select
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)] text-sm p-2 focus:outline-none focus:border-[#ff8a00] transition-colors"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="" disabled>Select an option</option>
        {options.map(opt => {
          const v = typeof opt === 'number' ? String(opt) : opt.value
          const l = typeof opt === 'number' ? String(opt) : opt.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
    </div>
  )
}
