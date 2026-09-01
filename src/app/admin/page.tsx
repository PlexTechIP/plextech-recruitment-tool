'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, canAccessAdmin, CurrentUser } from '@/lib/auth'
import { RecruitmentCycle, Round, EssayPrompt, Applicant, RoundStatus } from '@/lib/types'
import { evaluateResults } from '@/lib/scoring'
import Papa from 'papaparse'

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
    { id: '', cycle_id: '', question_number: 1, prompt: '', description: null, criterion1: null, criterion2: null },
    { id: '', cycle_id: '', question_number: 2, prompt: '', description: null, criterion1: null, criterion2: null },
    { id: '', cycle_id: '', question_number: 3, prompt: '', description: null, criterion1: null, criterion2: null },
  ])
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMessage, setPromptMessage] = useState('')

  // Rounds
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const roundDetailRef = useRef<HTMLDivElement>(null)

  // Grader assignment
  const [assignMessage, setAssignMessage] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  // Analytics
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null)

  // Start deliberation
  const [delibLoading, setDelibLoading] = useState(false)
  const [delibMessage, setDelibMessage] = useState('')
  const [roundSessions, setRoundSessions] = useState<{ id: string; status: string; role: 'curriculum' | 'developer' | null }[]>([])

  // Deadline
  const [deadlineInput, setDeadlineInput] = useState<string>('')
  const [deadlineSaving, setDeadlineSaving] = useState(false)
  const [startGradingLoading, setStartGradingLoading] = useState(false)
  const [startGradingMessage, setStartGradingMessage] = useState('')

  // Grading progress (for rubric rounds)
  const [gradingProgress, setGradingProgress] = useState<{ totalAssignments: number; completedReviews: number; graders: { email: string; assigned: number; completed: number }[] } | null>(null)

  // Interview form URL
  const [interviewFormUrl, setInterviewFormUrl] = useState<string>('')
  const [formUrlSaving, setFormUrlSaving] = useState(false)

  // Track previous cycle ID so we only reset deadline input when switching cycles
  const prevCycleIdRef = useRef<string | null>(null)

  // Interview CSV import
  const interviewFileRef = useRef<HTMLInputElement>(null)
  const [interviewCsvText, setInterviewCsvText] = useState<string>('')
  const [interviewColumns, setInterviewColumns] = useState<string[]>([])
  const [nameColumn, setNameColumn] = useState<string>('')
  const [maxRating, setMaxRating] = useState<number>(7)
  const [interviewPreview, setInterviewPreview] = useState<{ name: string; scores: Record<string, number>; texts: Record<string, string>; avg: number }[] | null>(null)
  const [interviewImporting, setInterviewImporting] = useState(false)
  const [interviewMessage, setInterviewMessage] = useState('')

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

  // Restore previously selected cycle from sessionStorage once cycles load.
  // Gate the persist effect on this ref so the initial null state doesn't
  // wipe the saved id before we get a chance to read it.
  const cycleRestoredRef = useRef(false)
  useEffect(() => {
    if (cycleRestoredRef.current || cycles.length === 0) return
    cycleRestoredRef.current = true
    const savedId = sessionStorage.getItem('admin:selectedCycleId')
    if (!savedId) return
    const match = cycles.find(c => c.id === savedId)
    if (match) setSelectedCycle(match)
  }, [cycles])

  useEffect(() => {
    if (!cycleRestoredRef.current) return
    if (selectedCycle) sessionStorage.setItem('admin:selectedCycleId', selectedCycle.id)
    else sessionStorage.removeItem('admin:selectedCycleId')
  }, [selectedCycle])

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
      return found ?? { id: '', cycle_id: cycleId, question_number: n, prompt: '', description: null, criterion1: null, criterion2: null }
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
      setInterviewMessage('')
      setInterviewPreview(null)
      setInterviewCsvText('')
    }
  }, [selectedCycle, loadPrompts])

  // Only reset deadline input when switching to a different cycle.
  // datetime-local inputs expect LOCAL wall-clock time, so format manually —
  // toISOString() would render UTC and show a time shifted by the tz offset.
  useEffect(() => {
    if (selectedCycle?.id === prevCycleIdRef.current) return
    prevCycleIdRef.current = selectedCycle?.id ?? null
    if (!selectedCycle?.application_deadline) { setDeadlineInput(''); return }
    const d = new Date(selectedCycle.application_deadline)
    const pad = (n: number) => String(n).padStart(2, '0')
    setDeadlineInput(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
  }, [selectedCycle])

  // Load grading progress or interview form URL when round changes
  useEffect(() => {
    setGradingProgress(null)
    setInterviewFormUrl('')
    setInterviewPreview(null)
    setInterviewCsvText('')
    setInterviewMessage('')
    setRoundSessions([])
    if (!selectedRound) return
    fetch(`/api/sessions?round_id=${selectedRound.id}`)
      .then(r => r.json())
      .then((data: { id: string; status: string; role: 'curriculum' | 'developer' | null }[]) => {
        if (Array.isArray(data)) setRoundSessions(data)
      })
      .catch(() => {})
    if (selectedRound.grading_type === 'rubric') {
      fetch(`/api/admin/grading-stats?round_id=${selectedRound.id}`)
        .then(r => r.json())
        .then(data => {
          const graders: { email: string; assigned: number; completed: number }[] = data.graders ?? []
          setGradingProgress({
            totalAssignments: graders.reduce((s, g) => s + g.assigned, 0),
            completedReviews: graders.reduce((s, g) => s + g.completed, 0),
            graders,
          })
        })
    }
    if (selectedRound.grading_type === 'interview') {
      setInterviewFormUrl(selectedRound.interview_form_url ?? '')
    }
  }, [selectedRound])

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
        criterion1: p.criterion1,
        criterion2: p.criterion2,
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

  async function renameRound(round: Round) {
    const next = prompt('Rename round:', round.name)?.trim()
    if (!next || next === round.name) return
    const res = await fetch(`/api/rounds/${round.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`Failed to rename round: ${err?.error ?? res.statusText}`)
      return
    }
    const updated = { ...round, name: next }
    setRounds(prev => prev.map(r => r.id === round.id ? updated : r))
    if (selectedRound?.id === round.id) setSelectedRound(updated)
  }

  // Destructively rebuild a rubric round's deliberation sessions: wipe all existing
  // sessions for the round (and their votes/notes) then re-run startDeliberation to
  // produce fresh Curriculum + Developer sessions split by applicant.desired_roles.
  async function resplitRoundByRole() {
    if (!selectedRound) return
    if (selectedRound.grading_type !== 'rubric') return
    const sessionCount = roundSessions.length
    if (!confirm(
      `Re-split this round into Curriculum + Developer sessions?\n\n` +
      `This will DELETE the existing ${sessionCount} session${sessionCount !== 1 ? 's' : ''} ` +
      `and ALL of their votes and notes, then create fresh sessions split by applicant role.\n\n` +
      `This cannot be undone. Continue?`
    )) return

    try {
      for (const s of roundSessions) {
        const res = await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(`Failed to delete session ${s.id}: ${err?.error ?? res.statusText}`)
        }
      }
      setRoundSessions([])
      await startDeliberation()
      // Re-fetch sessions so the new role-tagged ones appear in the UI
      const data = await fetch(`/api/sessions?round_id=${selectedRound.id}`).then(r => r.json()).catch(() => [])
      if (Array.isArray(data)) setRoundSessions(data)
    } catch (err: unknown) {
      setDelibMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async function tagSessionRole(sessionId: string, role: 'curriculum' | 'developer') {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`Could not tag session: ${err?.error ?? res.statusText}`)
      return
    }
    // Refresh the session list for the selected round
    setRoundSessions(prev => prev.map(s => s.id === sessionId ? { ...s, role } : s))
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
    const leadership = allUsers.filter(u => u.role === 'leadership' || u.role === 'admin').map(u => u.email)
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

  // ── deadline ─────────────────────────────────────────────
  const [exportingCsv, setExportingCsv] = useState(false)
  async function exportApplications() {
    if (!selectedCycle) return
    setExportingCsv(true)
    try {
      const res = await fetch(`/api/cycles/${selectedCycle.id}/applicants/export`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Export failed: ${err?.error ?? res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `applications-${selectedCycle.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExportingCsv(false)
    }
  }

  async function saveDeadline() {
    if (!selectedCycle) return
    setDeadlineSaving(true)
    const deadline = deadlineInput ? new Date(deadlineInput).toISOString() : null
    await fetch(`/api/cycles/${selectedCycle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_deadline: deadline }),
    })
    // Update local state directly without going through the selectedCycle useEffect
    const updatedCycle = { ...selectedCycle, application_deadline: deadline }
    setCycles(prev => prev.map(c => c.id === selectedCycle.id ? updatedCycle : c))
    setSelectedCycle(updatedCycle)
    setDeadlineSaving(false)
  }

  // ── start grading ─────────────────────────────────────────
  async function startGrading() {
    if (!selectedCycle) return
    setStartGradingLoading(true)
    setStartGradingMessage('')

    // Create a rubric round
    const roundRes = await fetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycle_id: selectedCycle.id,
        name: 'Application Review',
        grading_type: 'rubric',
        order_index: 1,
        status: 'pending',
      }),
    })
    if (!roundRes.ok) {
      setStartGradingMessage('Failed to create round.')
      setStartGradingLoading(false)
      return
    }
    const newRound: Round = await roundRes.json()
    await loadRounds(selectedCycle.id)
    setSelectedRound(newRound)

    // Assign graders
    const [allUsers, appsData] = await Promise.all([
      fetch('/api/authorized-users').then(r => r.json()) as Promise<{ email: string; role: string }[]>,
      fetch(`/api/cycles/${selectedCycle.id}/applicants`).then(r => r.json()) as Promise<{ id: string }[]>,
    ])

    const members = allUsers.filter(u => u.role === 'grader').map(u => u.email)
    const leadership = allUsers.filter(u => u.role === 'leadership' || u.role === 'admin').map(u => u.email)
    const applicants = (appsData ?? []).map(a => a.id)

    if (applicants.length === 0) { setStartGradingMessage('Round created, but no applicants found to assign.'); setStartGradingLoading(false); return }
    if (members.length + leadership.length === 0) { setStartGradingMessage('Round created, but no graders found.'); setStartGradingLoading(false); return }

    const MEMBER_REDUNDANCY = 2
    const LEADER_REDUNDANCY = 2
    const rows: { round_id: string; applicant_id: string; grader_email: string }[] = []
    let mp = 0, lp = 0
    for (const appId of applicants) {
      const assigned = new Set<string>()
      for (let i = 0; i < MEMBER_REDUNDANCY && members.length > 0; i++) { assigned.add(members[mp % members.length]); mp++ }
      for (let i = 0; i < LEADER_REDUNDANCY && leadership.length > 0; i++) { assigned.add(leadership[lp % leadership.length]); lp++ }
      for (const email of assigned) rows.push({ round_id: newRound.id, applicant_id: appId, grader_email: email })
    }

    await fetch('/api/grader-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    })
    await fetch(`/api/rounds/${newRound.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'grading' }),
    })
    await loadRounds(selectedCycle.id)
    setStartGradingMessage(`Grading started — ${applicants.length} applicants assigned across ${members.length + leadership.length} graders.`)
    setStartGradingLoading(false)
  }

  // ── interview form URL ─────────────────────────────────────
  async function saveInterviewFormUrl() {
    if (!selectedRound) return
    setFormUrlSaving(true)
    const res = await fetch(`/api/rounds/${selectedRound.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interview_form_url: interviewFormUrl || null }),
    })
    const updated = await res.json()
    setRounds(prev => prev.map(r => r.id === updated.id ? updated : r))
    setSelectedRound(updated)
    setFormUrlSaving(false)
  }

  // ── interview CSV import ──────────────────────────────────
  function parseInterviewCsv(text: string) {
    // Strip UTF-8 BOM that Excel/Sheets exports often include.
    const clean = text.replace(/^﻿/, '')
    const result = Papa.parse<Record<string, string>>(clean, { header: true, skipEmptyLines: true, dynamicTyping: false })
    const rows = result.data
    if (!rows.length) return
    const cols = Object.keys(rows[0])
    setInterviewColumns(cols)
    // Pick the first column whose name suggests it holds the candidate's name,
    // preferring "interviewee/applicant/candidate" over a generic "name" match.
    const pick = cols.find(c => /interviewee|applicant|candidate/i.test(c))
      ?? cols.find(c => /\bname\b/i.test(c))
      ?? cols[0]
    setNameColumn(pick)
    setInterviewPreview(null)
  }

  function buildInterviewPreview() {
    if (!interviewCsvText || !nameColumn) return
    const result = Papa.parse<Record<string, string>>(interviewCsvText, { header: true, skipEmptyLines: true, dynamicTyping: false })
    const rows = result.data

    // Identify rating columns: every non-empty cell must parse as a number (rejects text/comment
    // columns). Out-of-range cells are filtered later, not column-disqualifying — so one stray
    // "8" on a 1-7 column doesn't drop the whole column.
    const skipCols = new Set([nameColumn, 'Timestamp', 'Email Address', 'Email', 'email', 'Score', 'Interviewer (member of PlexTech)'])
    const allCols = rows.length > 0 ? Object.keys(rows[0]) : []
    const ratingCols = new Set<string>()
    for (const col of allCols) {
      if (skipCols.has(col)) continue
      let hasValue = false
      let valid = true
      for (const row of rows) {
        const raw = (row[col] ?? '').trim()
        if (!raw) continue
        const n = parseFloat(raw)
        // Reject if cell has content but doesn't parse as a number (i.e. it's text).
        // parseFloat is lenient — "7/10" → 7 — so we also require the string to look numeric.
        if (isNaN(n) || !/^-?\d+(\.\d+)?$/.test(raw)) { valid = false; break }
        hasValue = true
      }
      if (valid && hasValue) ratingCols.add(col)
    }

    // Text columns: anything that's not a rating column, not in skipCols, and has at least one
    // non-empty value across rows. These hold per-interviewer notes/responses.
    const textCols: string[] = []
    for (const col of allCols) {
      if (skipCols.has(col) || ratingCols.has(col)) continue
      if (rows.some(row => (row[col] ?? '').trim().length > 0)) textCols.push(col)
    }

    // Auto-detect the "interviewer" column so text entries can be attributed.
    const interviewerCol = allCols.find(c => /interviewer|grader|reviewer/i.test(c))
      ?? 'Interviewer (member of PlexTech)'

    type CandidateAgg = {
      scores: Record<string, number[]>
      texts: Record<string, { interviewer: string; text: string }[]>
    }
    const grouped = new Map<string, CandidateAgg>()
    for (const row of rows) {
      const name = (row[nameColumn] ?? '').trim()
      if (!name) continue
      if (!grouped.has(name)) grouped.set(name, { scores: {}, texts: {} })
      const entry = grouped.get(name)!
      const interviewer = (row[interviewerCol] ?? '').trim() || 'Interviewer'

      for (const col of ratingCols) {
        const raw = (row[col] ?? '').trim()
        if (!raw) continue
        const n = parseFloat(raw)
        if (isNaN(n) || n < 0 || n > maxRating) continue
        if (!entry.scores[col]) entry.scores[col] = []
        entry.scores[col].push(n)
      }

      for (const col of textCols) {
        const raw = (row[col] ?? '').trim()
        if (!raw) continue
        if (!entry.texts[col]) entry.texts[col] = []
        entry.texts[col].push({ interviewer, text: raw })
      }
    }

    const preview = [...grouped.entries()].map(([name, agg]) => {
      const avgScores: Record<string, number> = {}
      let total = 0, count = 0
      for (const [col, vals] of Object.entries(agg.scores)) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        avgScores[col] = Math.round(avg * 100) / 100
        total += avg
        count++
      }
      const texts: Record<string, string> = {}
      for (const [col, vals] of Object.entries(agg.texts)) {
        const distinct = new Set(vals.map(v => v.interviewer))
        texts[col] = distinct.size > 1
          ? vals.map(v => `${v.interviewer}: ${v.text}`).join('\n\n')
          : vals.map(v => v.text).join('\n\n')
      }
      return {
        name,
        scores: avgScores,
        texts,
        avg: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
      }
    }).sort((a, b) => b.avg - a.avg)

    setInterviewPreview(preview)
  }

  async function importInterviewResponses() {
    if (!interviewPreview || !selectedCycle || !currentUser || !selectedRound) return
    setInterviewImporting(true)
    setInterviewMessage('')
    try {
      const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          round_id: selectedRound.id,
          name: `${selectedCycle.name} — ${selectedRound.name} Deliberation`,
          status: 'active',
          created_by: currentUser.email,
          anonymous: false,
          role: selectedRound.role ?? null,
        }),
      })
      if (!sessionRes.ok) throw new Error('Failed to create session.')
      await fetch('/api/session-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, user_email: currentUser.email }),
      })
      const candidates = interviewPreview.map((c, idx) => ({
        session_id: sessionId,
        name: c.name,
        status: 'pending',
        data: { score: c.avg, candidate_number: idx + 1, ...c.scores, ...c.texts },
      }))
      await fetch(`/api/sessions/${sessionId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidates),
      })
      await updateRoundStatus(selectedRound, 'deliberating')
      setInterviewMessage(`Session created! ID: ${sessionId}`)
      setTimeout(() => router.push(`/session/${sessionId}`), 1500)
    } catch (err: unknown) {
      setInterviewMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setInterviewImporting(false)
    }
  }

  // ── analytics ────────────────────────────────────────────
  async function loadAnalytics(cycleId: string) {
    const data: Applicant[] = await fetch(`/api/cycles/${cycleId}/applicants`).then(r => r.json())
    if (!data) return
    const counts: Record<string, number> = { total: data.length, freshman: 0, sophomore: 0, junior: 0, senior: 0, male: 0, female: 0, other: 0 }
    // Legacy applicants stored a graduation year instead of a class-year label
    const legacyYearMap: Record<string, string> = { [String(new Date().getFullYear())]: 'senior', [String(new Date().getFullYear()+1)]: 'junior', [String(new Date().getFullYear()+2)]: 'sophomore', [String(new Date().getFullYear()+3)]: 'freshman' }
    for (const app of data) {
      const raw = app.year ?? ''
      const yr = ['Freshman', 'Sophomore', 'Junior', 'Senior'].includes(raw)
        ? raw.toLowerCase()
        : legacyYearMap[raw]
      if (yr) counts[yr]++
      const g = (app.gender ?? '').toLowerCase()
      if (g === 'male') counts.male++
      else if (g === 'female') counts.female++
      else counts.other++
    }
    setAnalytics(counts)
  }

  // ── start deliberation ───────────────────────────────────
  // Creates two sessions for the rubric round — one per applicant role (curriculum, developer).
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

      const roleSplits: { role: 'curriculum' | 'developer'; label: string; match: (dr: string | null) => boolean }[] = [
        { role: 'curriculum', label: 'Curriculum', match: dr => dr !== 'Industry Developer' },
        { role: 'developer',  label: 'Developer',  match: dr => dr === 'Industry Developer' },
      ]

      const createdIds: string[] = []
      const skipped: string[] = []

      // Roles that already have an active session are skipped, not fatal —
      // this lets Start Deliberation be re-run to fill in a missing track.
      const existingSessions: { role: string | null; status: string }[] =
        await fetch(`/api/sessions?round_id=${selectedRound.id}`).then(r => r.ok ? r.json() : []).catch(() => [])
      const rolesWithSession = new Set(
        existingSessions.filter(s => s.status === 'active').map(s => s.role)
      )

      for (const split of roleSplits) {
        if (rolesWithSession.has(split.role)) { skipped.push(`${split.label} (already exists)`); continue }
        const filtered = evaluated.filter(ev => split.match(ev.desired_roles))
        if (!filtered.length) { skipped.push(`${split.label} (no graded applicants)`); continue }

        const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase()
        const sessionName = `${selectedCycle.name} — ${selectedRound.name} (${split.label})`

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
            role: split.role,
          }),
        })
        if (!sessionRes.ok) {
          const err = await sessionRes.json().catch(() => ({}))
          throw new Error(err.error ?? `Failed to create ${split.label} session.`)
        }

        await fetch('/api/session-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, user_email: currentUser.email }),
        })

        const candidates = filtered.map((ev, idx) => ({
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

        createdIds.push(`${split.label}: ${sessionId}`)
      }

      if (!createdIds.length) {
        throw new Error(`No sessions created. ${skipped.length ? 'Skipped: ' + skipped.join(', ') : 'No applicants matched curriculum or developer roles.'}`)
      }

      await updateRoundStatus(selectedRound, 'deliberating')

      // Refresh session buttons in the round header
      const refreshed = await fetch(`/api/sessions?round_id=${selectedRound.id}`).then(r => r.ok ? r.json() : []).catch(() => [])
      if (Array.isArray(refreshed)) setRoundSessions(refreshed)

      setDelibMessage(
        `Sessions created — ${createdIds.join(', ')}` +
        (skipped.length ? ` · Skipped: ${skipped.join(', ')}` : '')
      )
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
        <div className="flex items-center gap-1">
          <button onClick={() => router.push('/dashboard')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-lg">
            ← Dashboard
          </button>
          <span className="text-[var(--border)] px-1">|</span>
          <button className="text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-active)] px-3 py-1.5 rounded-lg">
            Admin Console
          </button>
          <button onClick={() => router.push('/admin/grading')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-lg">
            Grading Console
          </button>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">{selectedCycle.name}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{selectedCycle.status}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportApplications}
                    disabled={exportingCsv}
                    title="Export applicant data to CSV"
                    className="text-sm px-4 py-2 rounded-lg border font-medium bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)] hover:text-[#FF6B35] hover:border-[#FF6B35]/50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {exportingCsv ? 'Exporting…' : 'Export applicant data to CSV'}
                  </button>
                  <button
                    onClick={() => toggleAccepting(selectedCycle)}
                    className={`text-sm px-4 py-2 rounded-lg border font-medium transition-colors cursor-pointer ${
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
                      className="text-sm px-4 py-2 rounded-lg border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 font-medium transition-colors cursor-pointer"
                    >
                      End Cycle
                    </button>
                  )}
                </div>
              </div>

              {/* Application deadline */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Application Deadline</p>
                {(() => {
                  const dl = selectedCycle.application_deadline ? new Date(selectedCycle.application_deadline) : null
                  const passed = dl && dl <= new Date()
                  return (
                    <>
                      {dl && (
                        <p className={`text-sm font-medium ${passed ? 'text-amber-400' : 'text-green-400'}`}>
                          {passed ? '⏰ Deadline passed — ' : '🕐 Closes '}{dl.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Los_Angeles' })} PT
                        </p>
                      )}
                      <div className="flex gap-2 items-center">
                        <input
                          type="datetime-local"
                          value={deadlineInput}
                          onChange={e => setDeadlineInput(e.target.value)}
                          className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#FF6B35]"
                        />
                        <button
                          onClick={saveDeadline}
                          disabled={deadlineSaving}
                          className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer"
                        >
                          {deadlineSaving ? 'Saving...' : 'Set Deadline'}
                        </button>
                        {deadlineInput && (
                          <button
                            onClick={() => { setDeadlineInput(''); saveDeadline() }}
                            className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {passed && !rounds.some(r => r.grading_type === 'rubric') && (
                        <div className="pt-2 space-y-2">
                          <button
                            onClick={startGrading}
                            disabled={startGradingLoading}
                            className="plex-gradient disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer"
                          >
                            {startGradingLoading ? 'Starting...' : '▶ Start Grading'}
                          </button>
                          {startGradingMessage && <p className="text-sm text-green-400">{startGradingMessage}</p>}
                        </div>
                      )}
                      {passed && rounds.some(r => r.grading_type === 'rubric') && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs text-green-400 font-medium">✓ Grading round active</span>
                          <button
                            onClick={() => router.push('/admin/grading')}
                            className="text-xs text-[var(--text-muted)] underline hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            View Grading Console →
                          </button>
                        </div>
                      )}
                    </>
                  )
                })()}
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
                  <div key={i} className="space-y-1.5 pb-3 border-b border-[var(--border)] last:border-0">
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
                    <input
                      type="text"
                      value={p.criterion1 ?? ''}
                      onChange={e => setPrompts(prev => prev.map((x, j) => j === i ? { ...x, criterion1: e.target.value } : x))}
                      placeholder="Grading criterion 1 (e.g. To what degree does the applicant demonstrate passion?)"
                      className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
                    />
                    <input
                      type="text"
                      value={p.criterion2 ?? ''}
                      onChange={e => setPrompts(prev => prev.map((x, j) => j === i ? { ...x, criterion2: e.target.value } : x))}
                      placeholder="Grading criterion 2 (e.g. To what extent does the applicant exhibit knowledge?)"
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
                      onClick={() => { setSelectedRound(round); setDelibMessage(''); setAssignMessage(''); setTimeout(() => roundDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}
                      className="flex-1 text-left px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-[var(--text-primary)] truncate">{round.name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {round.grading_type ?? 'delib only'}{round.role ? ` · ${round.role}` : ''}
                          </p>
                        </div>
                        <Badge label={round.status} color={STATUS_COLOR[round.status]} />
                      </div>
                    </button>
                    <button
                      onClick={() => renameRound(round)}
                      className="px-2 py-3 text-[var(--text-muted)] hover:text-[#FF6B35] transition-colors text-sm"
                      title="Rename round"
                    >
                      ✎
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
                  <p className="text-sm text-[var(--text-muted)]">No rounds yet. Rounds are created automatically when you start grading or advance accepted candidates.</p>
                )}
              </div>
            </Section>

            {/* Round detail */}
            <div ref={roundDetailRef} />
            {selectedRound && (
              <Section title={`Round: ${selectedRound.name}`}>
                {/* Status (read-only) + role + per-session deliberation links */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={selectedRound.status} color={STATUS_COLOR[selectedRound.status]} />
                  {selectedRound.role && (
                    <Badge
                      label={selectedRound.role}
                      color={selectedRound.role === 'curriculum'
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'}
                    />
                  )}
                  <button
                    onClick={() => renameRound(selectedRound)}
                    className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Rename ✎
                  </button>
                  {roundSessions.map(s => {
                    const dot = s.role === 'curriculum'
                      ? 'bg-purple-400'
                      : s.role === 'developer'
                        ? 'bg-cyan-400'
                        : 'bg-[var(--text-muted)]'

                    const label = s.role
                      ? s.role.charAt(0).toUpperCase() + s.role.slice(1)
                      : s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => router.push(`/session/${s.id}`)}
                        className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-[var(--bg-raised)] border-[var(--border)] text-[var(--text-primary)] hover:border-[#FF6B35]/40 transition-colors inline-flex items-center gap-2"
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
                        Go to {label} Deliberation →
                      </button>
                    )
                  })}
                  {selectedRound.grading_type === 'rubric' && roundSessions.length > 0 && (
                    <button
                      onClick={resplitRoundByRole}
                      className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20 transition-colors"
                      title="Delete the current session(s) and re-create them as separate Curriculum + Developer deliberations based on each applicant's selected role. All votes and notes in the current sessions are lost."
                    >
                      Rebuild Sessions ⟳
                    </button>
                  )}
                </div>

                {/* ── RUBRIC round ── */}
                {selectedRound.grading_type === 'rubric' && (
                  <>
                    {/* Grader assignment */}
                    <div className="pt-3 border-t border-[var(--border)] space-y-2">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Grader Assignment</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Assigns all applicants to graders using round-robin (2 graders + 2 leadership per applicant). Run this once when the application deadline has passed.
                      </p>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={assignGraders}
                          disabled={assignLoading || selectedRound.status !== 'pending'}
                          className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
                        >
                          {assignLoading ? 'Assigning...' : 'Assign Graders'}
                        </button>
                        <button
                          onClick={() => router.push('/admin/grading')}
                          className="text-sm px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          View Grading Console →
                        </button>
                      </div>
                      {assignMessage && <p className="text-sm text-green-400">{assignMessage}</p>}
                    </div>

                    {/* Grading progress */}
                    {gradingProgress && (
                      <div className="pt-3 border-t border-[var(--border)] space-y-3">
                        <p className="text-sm font-medium text-[var(--text-primary)]">Grading Progress</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#FF6B35] rounded-full transition-all"
                              style={{ width: `${gradingProgress.totalAssignments > 0 ? Math.round((gradingProgress.completedReviews / gradingProgress.totalAssignments) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono text-[var(--text-primary)] shrink-0">
                            {gradingProgress.completedReviews}/{gradingProgress.totalAssignments} reviews
                          </span>
                        </div>
                        {gradingProgress.graders.length > 0 && (
                          <div className="space-y-1.5">
                            {gradingProgress.graders.map(g => (
                              <div key={g.email} className="flex items-center gap-2 text-xs">
                                <span className="text-[var(--text-muted)] w-48 truncate">{g.email}</span>
                                <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${g.completed === g.assigned ? 'bg-green-500' : 'bg-[#FF6B35]'}`}
                                    style={{ width: `${g.assigned > 0 ? Math.round((g.completed / g.assigned) * 100) : 0}%` }}
                                  />
                                </div>
                                <span className={`font-mono shrink-0 ${g.completed === g.assigned ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
                                  {g.completed}/{g.assigned}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {gradingProgress.totalAssignments > 0 && gradingProgress.completedReviews < gradingProgress.totalAssignments && (
                          <p className="text-xs text-amber-400">
                            {gradingProgress.totalAssignments - gradingProgress.completedReviews} reviews still pending
                          </p>
                        )}
                        {gradingProgress.completedReviews === gradingProgress.totalAssignments && gradingProgress.totalAssignments > 0 && (
                          <p className="text-xs text-green-400">✓ All grading complete — ready to start deliberation</p>
                        )}
                      </div>
                    )}

                    {/* Start deliberation */}
                    <div className="pt-3 border-t border-[var(--border)] space-y-2">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Start Deliberation</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Computes normalized scores from all reviews and creates a ranked delib session.
                      </p>
                      <button
                        onClick={startDeliberation}
                        disabled={delibLoading}
                        className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
                      >
                        {delibLoading ? 'Creating session...' : 'Start Deliberation'}
                      </button>
                      {delibMessage && (
                        <p className={`text-sm ${delibMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                          {delibMessage}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* ── INTERVIEW round ── */}
                {selectedRound.grading_type === 'interview' && (
                  <>
                    {/* Google Form URL */}
                    <div className="pt-3 border-t border-[var(--border)] space-y-2">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Interview Form</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Link to the Google Form graders fill out during interviews. Graders will see this link on their grading page.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={interviewFormUrl}
                          onChange={e => setInterviewFormUrl(e.target.value)}
                          placeholder="https://docs.google.com/forms/..."
                          className="flex-1 bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
                        />
                        <button
                          onClick={saveInterviewFormUrl}
                          disabled={formUrlSaving}
                          className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer shrink-0"
                        >
                          {formUrlSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {selectedRound.interview_form_url && (
                        <a
                          href={selectedRound.interview_form_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Open form ↗
                        </a>
                      )}
                    </div>

                    {/* Import responses */}
                    <div className="pt-3 border-t border-[var(--border)] space-y-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Import Interview Responses</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Export your Google Form responses as CSV, then paste or upload here. Responses are grouped by candidate name and averaged across multiple graders.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => interviewFileRef.current?.click()}
                          className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          Upload CSV
                        </button>
                        <input
                          ref={interviewFileRef}
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const text = await file.text()
                            setInterviewCsvText(text)
                            parseInterviewCsv(text)
                            if (interviewFileRef.current) interviewFileRef.current.value = ''
                          }}
                        />
                      </div>
                      <textarea
                        value={interviewCsvText}
                        onChange={e => { setInterviewCsvText(e.target.value); parseInterviewCsv(e.target.value) }}
                        placeholder="Or paste CSV here..."
                        rows={4}
                        className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35] resize-none"
                      />

                      {interviewColumns.length > 0 && (
                        <div className="flex gap-2 items-center flex-wrap">
                          <label className="text-xs text-[var(--text-muted)] shrink-0">Candidate name column:</label>
                          <select
                            value={nameColumn}
                            onChange={e => setNameColumn(e.target.value)}
                            className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#FF6B35]"
                          >
                            {interviewColumns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <label className="text-xs text-[var(--text-muted)] shrink-0">Max rating:</label>
                          <input
                            type="number"
                            min={1}
                            value={maxRating}
                            onChange={e => setMaxRating(Number(e.target.value) || 0)}
                            className="w-20 bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#FF6B35]"
                          />
                          <button
                            onClick={buildInterviewPreview}
                            className="plex-gradient text-white text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer"
                          >
                            Preview
                          </button>
                        </div>
                      )}

                      {interviewPreview && interviewPreview.length === 0 && (
                        <p className="text-xs text-red-400">No candidates found. Check that &quot;{nameColumn}&quot; is the correct name column — it appears empty for every row.</p>
                      )}
                      {interviewPreview && interviewPreview.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-[var(--text-muted)]">{interviewPreview.length} candidates parsed — scores averaged across all graders</p>
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)]">
                            <table className="w-full text-xs">
                              <thead className="bg-[var(--bg-raised)] sticky top-0">
                                <tr>
                                  <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">#</th>
                                  <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">Candidate</th>
                                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">Avg Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]">
                                {interviewPreview.map((c, i) => (
                                  <tr key={c.name} className="hover:bg-[var(--bg-raised)]">
                                    <td className="px-3 py-1.5 text-[var(--text-muted)]">{i + 1}</td>
                                    <td className="px-3 py-1.5 text-[var(--text-primary)]">{c.name}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-[#FF6B35]">{c.avg}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            onClick={importInterviewResponses}
                            disabled={interviewImporting}
                            className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
                          >
                            {interviewImporting ? 'Creating session...' : 'Create Deliberation Session'}
                          </button>
                          {interviewMessage && (
                            <p className={`text-sm ${interviewMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                              {interviewMessage}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ── Delib-only round ── */}
                {!selectedRound.grading_type && (
                  <div className="pt-3 border-t border-[var(--border)] space-y-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Start Deliberation</p>
                    <p className="text-xs text-[var(--text-muted)]">Creates a delib session for this round directly (no grading phase).</p>
                    <button
                      onClick={startDeliberation}
                      disabled={delibLoading}
                      className="plex-gradient disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
                    >
                      {delibLoading ? 'Creating session...' : 'Start Deliberation'}
                    </button>
                    {delibMessage && (
                      <p className={`text-sm ${delibMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                        {delibMessage}
                      </p>
                    )}
                  </div>
                )}
              </Section>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
