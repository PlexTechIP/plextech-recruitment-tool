'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, canAccessAdmin, CurrentUser } from '@/lib/auth'
import { RecruitmentCycle, Round, EssayPrompt, Applicant, RoundStatus, GradingType } from '@/lib/types'
import { evaluateResults } from '@/lib/scoring'

// ─── tiny shared UI ──────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <h2 className="font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${color}`}>{label}</span>
}

const STATUS_COLOR: Record<RoundStatus, string> = {
  pending:       'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]',
  grading:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  deliberating:  'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
  ended:         'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]',
}

// ─── main page ───────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Cycles
  const [cycles, setCycles] = useState<RecruitmentCycle[]>([])
  const [selectedCycle, setSelectedCycle] = useState<RecruitmentCycle | null>(null)
  const [newCycleName, setNewCycleName] = useState('')
  const [cycleError, setCycleError] = useState('')
  const [cycleLoading, setCycleLoading] = useState(false)

  // Essay prompts
  const [prompts, setPrompts] = useState<EssayPrompt[]>([
    { id: '', cycle_id: '', question_number: 1, prompt: '', description: null },
    { id: '', cycle_id: '', question_number: 2, prompt: '', description: null },
    { id: '', cycle_id: '', question_number: 3, prompt: '', description: null },
  ])
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMessage, setPromptMessage] = useState('')

  // Rounds
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [newRoundName, setNewRoundName] = useState('')
  const [newRoundType, setNewRoundType] = useState<GradingType | ''>('rubric')
  const [roundError, setRoundError] = useState('')

  // Grader assignment
  const [assignMessage, setAssignMessage] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  // Analytics
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null)

  // Start deliberation
  const [delibLoading, setDelibLoading] = useState(false)
  const [delibMessage, setDelibMessage] = useState('')

  // ── auth ─────────────────────────────────────────────────
  useEffect(() => {
    getCurrentUser().then(user => {
      if (!user) { router.replace('/'); return }
      if (!canAccessAdmin(user.role)) { router.replace('/dashboard'); return }
      setCurrentUser(user)
      setLoading(false)
    })
  }, [router])

  // ── cycles ───────────────────────────────────────────────
  const loadCycles = useCallback(async () => {
    const data: RecruitmentCycle[] = await fetch('/api/cycles').then(r => r.json())
    setCycles(data ?? [])
  }, [])

  useEffect(() => { if (!loading) loadCycles() }, [loading, loadCycles])

  async function createCycle() {
    setCycleError('')
    const name = newCycleName.trim()
    if (!name) { setCycleError('Enter a cycle name.'); return }
    setCycleLoading(true)
    const res = await fetch('/api/cycles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status: 'active', accepting_applications: false }),
    })
    if (!res.ok) {
      const err = await res.json()
      setCycleError(err.error ?? 'Failed to create cycle.')
      setCycleLoading(false)
      return
    }
    const data: RecruitmentCycle = await res.json()
    setNewCycleName('')
    await loadCycles()
    setSelectedCycle(data)
    setCycleLoading(false)
  }

  async function toggleAccepting(cycle: RecruitmentCycle) {
    const updated = { ...cycle, accepting_applications: !cycle.accepting_applications }
    await fetch(`/api/cycles/${cycle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepting_applications: updated.accepting_applications }),
    })
    setCycles(prev => prev.map(c => c.id === cycle.id ? updated : c))
    if (selectedCycle?.id === cycle.id) setSelectedCycle(updated)
  }

  async function endCycle(cycle: RecruitmentCycle) {
    if (!confirm(`End cycle "${cycle.name}"? This closes applications and marks the cycle as ended.`)) return
    await fetch(`/api/cycles/${cycle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended', accepting_applications: false }),
    })
    await loadCycles()
    if (selectedCycle?.id === cycle.id) setSelectedCycle(null)
  }

  // ── prompts ──────────────────────────────────────────────
  const loadPrompts = useCallback(async (cycleId: string) => {
    const existing: EssayPrompt[] = await fetch(`/api/cycles/${cycleId}/prompts`).then(r => r.json())
    const filled = [1, 2, 3].map(n => {
      const found = existing.find(p => p.question_number === n)
      return found ?? { id: '', cycle_id: cycleId, question_number: n, prompt: '', description: null }
    })
    setPrompts(filled)
  }, [])

  useEffect(() => {
    if (selectedCycle) {
      loadPrompts(selectedCycle.id)
      loadRounds(selectedCycle.id)
      loadAnalytics(selectedCycle.id)
      setSelectedRound(null)
      setDelibMessage('')
      setAssignMessage('')
      setPromptMessage('')
    }
  }, [selectedCycle, loadPrompts])

  async function savePrompts() {
    if (!selectedCycle) return
    setPromptSaving(true)
    setPromptMessage('')
    await fetch(`/api/cycles/${selectedCycle.id}/prompts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompts.map(p => ({
        ...(p.id ? { id: p.id } : {}),
        cycle_id: selectedCycle.id,
        question_number: p.question_number,
        prompt: p.prompt,
        description: p.description,
      }))),
    })
    await loadPrompts(selectedCycle.id)
    setPromptMessage('Saved.')
    setPromptSaving(false)
  }

  // ── rounds ───────────────────────────────────────────────
  async function loadRounds(cycleId: string) {
    const data: Round[] = await fetch(`/api/cycles/${cycleId}/rounds`).then(r => r.json())
    setRounds(data ?? [])
  }

  async function createRound() {
    setRoundError('')
    if (!selectedCycle) return
    const name = newRoundName.trim()
    if (!name) { setRoundError('Enter a round name.'); return }
    const orderIndex = rounds.length + 1
    const res = await fetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycle_id: selectedCycle.id,
        name,
        order_index: orderIndex,
        grading_type: newRoundType || null,
        status: 'pending',
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      setRoundError(err.error ?? 'Failed to create round.')
      return
    }
    const data: Round = await res.json()
    setNewRoundName('')
    setNewRoundType('rubric')
    await loadRounds(selectedCycle.id)
    setSelectedRound(data)
  }

  async function updateRoundStatus(round: Round, status: RoundStatus) {
    await fetch(`/api/rounds/${round.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const updated = { ...round, status }
    setRounds(prev => prev.map(r => r.id === round.id ? updated : r))
    setSelectedRound(updated)
  }

  async function deleteRound(round: Round) {
    if (!confirm(`Delete round "${round.name}"? This will also delete all grader assignments and reviews for this round.`)) return
    await fetch(`/api/rounds/${round.id}`, { method: 'DELETE' })
    if (selectedRound?.id === round.id) setSelectedRound(null)
    await loadRounds(selectedCycle!.id)
  }

  // ── grader assignment (round-robin) ──────────────────────
  async function assignGraders() {
    if (!selectedRound || !selectedCycle) return
    setAssignLoading(true)
    setAssignMessage('')

    const [allUsers, appsData] = await Promise.all([
      fetch('/api/authorized-users').then(r => r.json()) as Promise<{ email: string; role: string }[]>,
      fetch(`/api/cycles/${selectedCycle.id}/applicants`).then(r => r.json()) as Promise<{ id: string }[]>,
    ])

    const members = allUsers.filter(u => u.role === 'grader').map(u => u.email)
    const leadership = allUsers.filter(u => u.role === 'leadership').map(u => u.email)
    const applicants = (appsData ?? []).map(a => a.id)

    if (applicants.length === 0) { setAssignMessage('No applicants found for this cycle.'); setAssignLoading(false); return }
    if (members.length + leadership.length === 0) { setAssignMessage('No graders found.'); setAssignLoading(false); return }

    const MEMBER_REDUNDANCY = 2
    const LEADER_REDUNDANCY = 2
    const rows: { round_id: string; applicant_id: string; grader_email: string }[] = []

    let mp = 0, lp = 0
    for (const appId of applicants) {
      const assigned = new Set<string>()
      for (let i = 0; i < MEMBER_REDUNDANCY && members.length > 0; i++) {
        assigned.add(members[mp % members.length])
        mp++
      }
      for (let i = 0; i < LEADER_REDUNDANCY && leadership.length > 0; i++) {
        assigned.add(leadership[lp % leadership.length])
        lp++
      }
      for (const email of assigned) {
        rows.push({ round_id: selectedRound.id, applicant_id: appId, grader_email: email })
      }
    }

    await fetch('/api/grader-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    })
    await updateRoundStatus(selectedRound, 'grading')
    setAssignMessage(`Assigned ${applicants.length} applicants across ${members.length + leadership.length} graders.`)
    setAssignLoading(false)
  }

  // ── analytics ────────────────────────────────────────────
  async function loadAnalytics(cycleId: string) {
    const data: Applicant[] = await fetch(`/api/cycles/${cycleId}/applicants`).then(r => r.json())
    if (!data) return
    const counts: Record<string, number> = { total: data.length, freshman: 0, sophomore: 0, junior: 0, senior: 0, male: 0, female: 0, other: 0 }
    const yearMap: Record<string, string> = { [String(new Date().getFullYear())]: 'senior', [String(new Date().getFullYear()+1)]: 'junior', [String(new Date().getFullYear()+2)]: 'sophomore', [String(new Date().getFullYear()+3)]: 'freshman' }
    for (const app of data) {
      const yr = yearMap[app.year ?? '']
      if (yr) counts[yr]++
      const g = (app.gender ?? '').toLowerCase()
      if (g === 'male') counts.male++
      else if (g === 'female') counts.female++
      else counts.other++
    }
    setAnalytics(counts)
  }

  // ── start deliberation ───────────────────────────────────
  async function startDeliberation() {
    if (!selectedRound || !selectedCycle || !currentUser) return
    setDelibLoading(true)
    setDelibMessage('')

    try {
      const [reviewsData, appsData] = await Promise.all([
        fetch(`/api/reviews?round_id=${selectedRound.id}`).then(r => r.json()),
        fetch(`/api/cycles/${selectedCycle.id}/applicants`).then(r => r.json()),
      ])

      if (!reviewsData?.length) throw new Error('No reviews found for this round. Ensure grading is complete.')

      const evaluated = evaluateResults(reviewsData, appsData as Applicant[])
      if (!evaluated.length) throw new Error('Could not compute scores. Check that reviews exist.')

      const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const sessionName = `${selectedCycle.name} — ${selectedRound.name}`

      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          round_id: selectedRound.id,
          name: sessionName,
          status: 'active',
          created_by: currentUser.email,
          anonymous: false,
        }),
      })
      if (!sessionRes.ok) {
        const err = await sessionRes.json()
        throw new Error(err.error ?? 'Failed to create session.')
      }

      await fetch('/api/session-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, user_email: currentUser.email }),
      })

      const candidates = evaluated.map((ev, idx) => ({
        session_id: sessionId,
        applicant_id: ev.applicant_id,
        name: `${ev.first_name} ${ev.last_name}`,
        status: 'pending',
        data: {
          score: ev.total,
          candidate_number: idx + 1,
          desired_roles: ev.desired_roles,
          r0: ev.r0, r1: ev.r1, r2: ev.r2, r3: ev.r3, r4: ev.r4,
          r5: ev.r5, r6: ev.r6, r7: ev.r7, r8: ev.r8, r9: ev.r9,
        },
      }))

      await fetch(`/api/sessions/${sessionId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidates),
      })

      await updateRoundStatus(selectedRound, 'deliberating')

      setDelibMessage(`Session created! ID: ${sessionId}`)
      setTimeout(() => router.push(`/session/${sessionId}`), 1500)
    } catch (err: unknown) {
      setDelibMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDelibLoading(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
      <div className="text-[var(--text-muted)] text-sm">Loading...</div>
    </main>
  )

  const pct = (n: number) => analytics?.total ? `${((n / analytics.total) * 100).toFixed(1)}%` : '—'

  return (
    <main className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            ← Dashboard
          </button>
          <span className="text-[var(--border)]">|</span>
          <h1 className="font-bold text-[var(--text-primary)]">Admin Console</h1>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{currentUser?.email}</span>
      </header>

      <div className="flex-1 flex gap-0 overflow-hidden">

        {/* Left column — cycles */}
        <div className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Recruitment Cycles</p>
            <div className="space-y-2">
              {cycles.map(cycle => (
                <button
                  key={cycle.id}
                  onClick={() => setSelectedCycle(cycle)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedCycle?.id === cycle.id
                      ? 'bg-[var(--bg-active)] border-[#FF6B35]/40'
                      : 'bg-[var(--bg-raised)] border-[var(--border)] hover:bg-[var(--bg-active)]'
                  }`}
                >
                  <p className="font-medium text-sm text-[var(--text-primary)]">{cycle.name}</p>
                  <div className="flex gap-1.5 mt-1">
                    <Badge label={cycle.status} color={cycle.status === 'active' ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]'} />
                    {cycle.accepting_applications && <Badge label="open" color="bg-blue-500/15 text-blue-400 border-blue-500/30" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* New cycle form */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">New Cycle</p>
            <input
              type="text"
              value={newCycleName}
              onChange={e => setNewCycleName(e.target.value)}
              placeholder="e.g. FA2026"
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
              onKeyDown={e => e.key === 'Enter' && createCycle()}
            />
            {cycleError && <p className="text-red-400 text-xs">{cycleError}</p>}
            <button
              onClick={createCycle}
              disabled={cycleLoading}
              className="w-full plex-gradient disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg"
            >
              {cycleLoading ? 'Creating...' : 'Create Cycle'}
            </button>
          </div>
        </div>

        {/* Right column — cycle detail */}
        {!selectedCycle ? (
          <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
            Select or create a cycle to get started
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Cycle header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">{selectedCycle.name}</h2>
                <p className="text-sm text-[var(--text-muted)]">{selectedCycle.status}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAccepting(selectedCycle)}
                  className={`text-sm px-4 py-2 rounded-lg border font-medium transition-colors ${
                    selectedCycle.accepting_applications
                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25'
                      : 'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {selectedCycle.accepting_applications ? 'Close Applications' : 'Open Applications'}
                </button>
                {selectedCycle.status === 'active' && (
                  <button
                    onClick={() => endCycle(selectedCycle)}
                    className="text-sm px-4 py-2 rounded-lg border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 font-medium transition-colors"
                  >
                    End Cycle
                  </button>
                )}
              </div>
            </div>

            {/* Analytics */}
            {analytics && (
              <Section title="Analytics">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total', value: analytics.total },
                    { label: 'Freshman', value: `${analytics.freshman} (${pct(analytics.freshman)})` },
                    { label: 'Sophomore', value: `${analytics.sophomore} (${pct(analytics.sophomore)})` },
                    { label: 'Junior', value: `${analytics.junior} (${pct(analytics.junior)})` },
                    { label: 'Senior', value: `${analytics.senior} (${pct(analytics.senior)})` },
                    { label: 'Male', value: `${analytics.male} (${pct(analytics.male)})` },
                    { label: 'Female', value: `${analytics.female} (${pct(analytics.female)})` },
                    { label: 'Other Gender', value: `${analytics.other} (${pct(analytics.other)})` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[var(--bg-raised)] rounded-lg p-3">
                      <p className="text-xs text-[var(--text-muted)]">{label}</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Essay prompts */}
            <Section title="Essay Prompts">
              <div className="space-y-4">
                {prompts.map((p, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="text-xs font-medium text-[var(--text-muted)]">Question {p.question_number}</p>
                    <input
                      type="text"
                      value={p.prompt}
                      onChange={e => setPrompts(prev => prev.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x))}
                      placeholder="Question text..."
                      className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
                    />
                    <input
                      type="text"
                      value={p.description ?? ''}
                      onChange={e => setPrompts(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                      placeholder="Description / clarification (optional)..."
                      className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={savePrompts}
                  disabled={promptSaving}
                  className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {promptSaving ? 'Saving...' : 'Save Prompts'}
                </button>
                {promptMessage && <p className="text-green-400 text-sm">{promptMessage}</p>}
              </div>
            </Section>

            {/* Rounds */}
            <Section title="Rounds">
              <div className="space-y-2">
                {rounds.map(round => (
                  <div key={round.id} className={`flex items-center gap-1 rounded-lg border transition-colors ${
                    selectedRound?.id === round.id
                      ? 'bg-[var(--bg-active)] border-[#FF6B35]/40'
                      : 'bg-[var(--bg-raised)] border-[var(--border)]'
                  }`}>
                    <button
                      onClick={() => { setSelectedRound(round); setDelibMessage(''); setAssignMessage('') }}
                      className="flex-1 text-left px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-[var(--text-primary)]">{round.name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{round.grading_type ?? 'delib only'}</p>
                        </div>
                        <Badge label={round.status} color={STATUS_COLOR[round.status]} />
                      </div>
                    </button>
                    <button
                      onClick={() => deleteRound(round)}
                      className="px-2 py-3 text-[var(--text-muted)] hover:text-red-400 transition-colors text-sm"
                      title="Delete round"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {rounds.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No rounds yet. Create one below.</p>
                )}
              </div>

              {/* New round */}
              <div className="pt-3 border-t border-[var(--border)] space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">New Round</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRoundName}
                    onChange={e => setNewRoundName(e.target.value)}
                    placeholder="e.g. Application Review"
                    className="flex-1 bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
                  />
                  <select
                    value={newRoundType}
                    onChange={e => setNewRoundType(e.target.value as GradingType | '')}
                    className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-2 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#FF6B35]"
                  >
                    <option value="rubric">Rubric</option>
                    <option value="interview">Interview</option>
                    <option value="">Delib only</option>
                  </select>
                </div>
                {roundError && <p className="text-red-400 text-xs">{roundError}</p>}
                <button
                  onClick={createRound}
                  className="plex-gradient text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Create Round
                </button>
              </div>
            </Section>

            {/* Round detail */}
            {selectedRound && (
              <Section title={`Round: ${selectedRound.name}`}>
                <div className="flex gap-2 flex-wrap">
                  {(['pending', 'grading', 'deliberating', 'ended'] as RoundStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => updateRoundStatus(selectedRound, s)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                        selectedRound.status === s
                          ? STATUS_COLOR[s].replace('bg-', 'bg-').replace('/15', '/30')
                          : 'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Grader assignment */}
                {selectedRound.grading_type && (
                  <div className="pt-3 border-t border-[var(--border)] space-y-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Grader Assignment</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Assigns applicants to graders using round-robin. 2 members + 2 leadership per applicant.
                    </p>
                    <button
                      onClick={assignGraders}
                      disabled={assignLoading || selectedRound.status !== 'pending'}
                      className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                    >
                      {assignLoading ? 'Assigning...' : 'Assign Graders'}
                    </button>
                    {assignMessage && <p className="text-sm text-green-400">{assignMessage}</p>}
                  </div>
                )}

                {/* Start deliberation */}
                <div className="pt-3 border-t border-[var(--border)] space-y-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">Start Deliberation</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {selectedRound.grading_type
                      ? 'Computes normalized scores from all reviews and creates a delib session with ranked candidates.'
                      : 'Creates a delib session for this round directly (no grading phase).'}
                  </p>
                  <button
                    onClick={startDeliberation}
                    disabled={delibLoading}
                    className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                  >
                    {delibLoading ? 'Creating session...' : 'Start Deliberation'}
                  </button>
                  {delibMessage && (
                    <p className={`text-sm ${delibMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                      {delibMessage}
                    </p>
                  )}
                </div>
              </Section>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
