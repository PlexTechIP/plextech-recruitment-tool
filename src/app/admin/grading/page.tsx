'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, canAccessAdmin } from '@/lib/auth'
import { RecruitmentCycle, Round } from '@/lib/types'

interface GraderStat {
  email: string
  assigned: number
  completed: number
}

interface ApplicantRow {
  applicant_id: string
  first_name: string
  last_name: string
  desired_roles: string | null
  total: number
  review_count: number
  assigned_count: number
  reviews: { grader_email: string; r0: number; r1: number; r2: number; r3: number; r4: number; r5: number; r6: number; r7: number; r8: number; r9: number }[]
}

type SortKey = 'total' | 'name' | 'reviews'

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  return active ? <span className="ml-1">{direction === 'desc' ? '↓' : '↑'}</span> : null
}

export default function GradingConsolePage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [cycles, setCycles] = useState<RecruitmentCycle[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState<string>('')
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<string>('')
  const [graders, setGraders] = useState<GraderStat[]>([])
  const [applicants, setApplicants] = useState<ApplicantRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedApplicant, setExpandedApplicant] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadStats = useCallback(async (roundId: string) => {
    setLoading(true)
    const res = await fetch(`/api/admin/grading-stats?round_id=${roundId}`)
    const data = await res.json()
    setGraders(data.graders ?? [])
    setApplicants(data.applicants ?? [])
    setLoading(false)
  }, [])

  const selectRound = useCallback((roundId: string) => {
    setSelectedRoundId(roundId)
    setGraders([])
    setApplicants([])
    if (roundId) void loadStats(roundId)
  }, [loadStats])

  const selectCycle = useCallback(async (cycleId: string) => {
    setSelectedCycleId(cycleId)
    setSelectedRoundId('')
    setRounds([])
    setGraders([])
    setApplicants([])
    if (!cycleId) return

    const response = await fetch(`/api/cycles/${cycleId}/rounds`)
    const data: Round[] = await response.json()
    const sorted = (data ?? []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    setRounds(sorted)
    selectRound(sorted[0]?.id ?? '')
  }, [selectRound])

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || !canAccessAdmin(u.role)) { router.replace('/dashboard'); return }
      setAuthed(true)
    })
  }, [router])

  useEffect(() => {
    if (!authed) return
    fetch('/api/cycles').then(r => r.json()).then((data: RecruitmentCycle[]) => {
      setCycles(data ?? [])
      if (data?.length) void selectCycle(data[0].id)
    })
  }, [authed, selectCycle])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedApplicants = [...applicants].sort((a, b) => {
    let diff = 0
    if (sortKey === 'total') diff = a.total - b.total
    else if (sortKey === 'name') diff = `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)
    else if (sortKey === 'reviews') diff = a.review_count - b.review_count
    return sortDir === 'asc' ? diff : -diff
  })

  if (!authed) return null

  return (
    <main className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => router.push('/dashboard')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-lg">
            ← Dashboard
          </button>
          <span className="text-[var(--border)] px-1">|</span>
          <button onClick={() => router.push('/admin')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-lg">
            Admin Console
          </button>
          <button className="text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-active)] px-3 py-1.5 rounded-lg">
            Grading Console
          </button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto w-full py-8 px-4 space-y-6">

        {/* Cycle + Round selectors */}
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)] font-medium">Cycle</label>
            <select
              value={selectedCycleId}
              onChange={e => void selectCycle(e.target.value)}
              className="w-fit bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg pl-3 pr-2 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[#FF6B35]"
            >
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)] font-medium">Round</label>
            <select
              value={selectedRoundId}
              onChange={e => selectRound(e.target.value)}
              className="w-fit bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg pl-3 pr-2 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[#FF6B35]"
              disabled={rounds.length === 0}
            >
              {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => selectedRoundId && loadStats(selectedRoundId)}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm hover:bg-[var(--bg-raised)] transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--text-muted)] text-sm">Loading…</p>
        ) : !selectedRoundId ? (
          <p className="text-[var(--text-muted)] text-sm">Select a round to view grading stats.</p>
        ) : (
          <>
            {/* Grader Progress */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h2 className="font-semibold text-[var(--text-primary)]">Grader Progress</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{graders.length} graders assigned</p>
              </div>
              {graders.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[var(--text-muted)]">No graders assigned yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-raised)]">
                    <tr>
                      <th className="text-left px-5 py-2 text-xs text-[var(--text-muted)] font-medium">Grader</th>
                      <th className="text-right px-5 py-2 text-xs text-[var(--text-muted)] font-medium">Completed</th>
                      <th className="text-right px-5 py-2 text-xs text-[var(--text-muted)] font-medium">Assigned</th>
                      <th className="px-5 py-2 text-xs text-[var(--text-muted)] font-medium w-40">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {graders.map(g => {
                      const pct = g.assigned > 0 ? Math.round((g.completed / g.assigned) * 100) : 0
                      const done = g.completed === g.assigned
                      return (
                        <tr key={g.email} className="hover:bg-[var(--bg-raised)] transition-colors">
                          <td className="px-5 py-3 text-[var(--text-secondary)]">{g.email}</td>
                          <td className="px-5 py-3 text-right font-medium text-[var(--text-primary)]">{g.completed}</td>
                          <td className="px-5 py-3 text-right text-[var(--text-muted)]">{g.assigned}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-[#FF6B35]'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-xs w-8 text-right ${done ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Applicant Scores */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h2 className="font-semibold text-[var(--text-primary)]">Applicant Scores</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{applicants.length} applicants — click a row to see per-reviewer ratings</p>
              </div>
              {applicants.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[var(--text-muted)]">No applicants assigned yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-raised)]">
                    <tr>
                      <th
                        className="text-left px-5 py-2 text-xs text-[var(--text-muted)] font-medium cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => toggleSort('name')}
                      >
                        Name <SortIcon active={sortKey === 'name'} direction={sortDir} />
                      </th>
                      <th className="text-left px-5 py-2 text-xs text-[var(--text-muted)] font-medium">Role</th>
                      <th
                        className="text-right px-5 py-2 text-xs text-[var(--text-muted)] font-medium cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => toggleSort('reviews')}
                      >
                        Reviews <SortIcon active={sortKey === 'reviews'} direction={sortDir} />
                      </th>
                      <th
                        className="text-right px-5 py-2 text-xs text-[var(--text-muted)] font-medium cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => toggleSort('total')}
                      >
                        Score <SortIcon active={sortKey === 'total'} direction={sortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedApplicants.map(a => {
                      const expanded = expandedApplicant === a.applicant_id
                      const hasScore = a.review_count > 0
                      return (
                        <React.Fragment key={a.applicant_id}>
                          <tr
                            className="hover:bg-[var(--bg-raised)] transition-colors cursor-pointer"
                            onClick={() => setExpandedApplicant(expanded ? null : a.applicant_id)}
                          >
                            <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                              {a.last_name}, {a.first_name}
                              <span className="ml-2 text-[var(--text-muted)]">{expanded ? '▲' : '▼'}</span>
                            </td>
                            <td className="px-5 py-3 text-[var(--text-muted)] text-xs">{a.desired_roles ?? '—'}</td>
                            <td className="px-5 py-3 text-right text-[var(--text-muted)]">
                              {a.review_count}/{a.assigned_count}
                            </td>
                            <td className="px-5 py-3 text-right font-mono font-semibold">
                              {hasScore ? (
                                <span className="text-[#FF6B35]">{a.total.toFixed(2)}</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">—</span>
                              )}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-[var(--bg-raised)]">
                              <td colSpan={4} className="px-5 py-4">
                                {a.reviews.length === 0 ? (
                                  <p className="text-xs text-[var(--text-muted)]">No reviews submitted yet.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[var(--text-muted)]">
                                        <th className="text-left py-1 pr-4 font-medium">Grader</th>
                                        <th className="text-center px-2 font-medium" title="Time commitments concern">R0</th>
                                        <th className="text-center px-2 font-medium" title="Resume thoughtfulness">R1</th>
                                        <th className="text-center px-2 font-medium" title="Technical depth">R2</th>
                                        <th className="text-center px-2 font-medium" title="Passion (resume)">R3</th>
                                        <th className="text-center px-2 font-medium" title="Passion for club">R4</th>
                                        <th className="text-center px-2 font-medium" title="Club knowledge">R5</th>
                                        <th className="text-center px-2 font-medium" title="Creativity">R6</th>
                                        <th className="text-center px-2 font-medium" title="Eagerness to learn">R7</th>
                                        <th className="text-center px-2 font-medium" title="Leadership">R8</th>
                                        <th className="text-center px-2 font-medium" title="Commitment to community">R9</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                      {a.reviews.map(r => (
                                        <tr key={r.grader_email} className="text-[var(--text-secondary)]">
                                          <td className="py-1.5 pr-4">{r.grader_email}</td>
                                          {([r.r0, r.r1, r.r2, r.r3, r.r4, r.r5, r.r6, r.r7, r.r8, r.r9] as number[]).map((v, i) => (
                                            <td key={i} className="text-center px-2 font-mono">{v}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
