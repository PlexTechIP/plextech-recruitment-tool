'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Session, Candidate, Vote, VoteType, CandidateNote } from '@/lib/types'
import AdminPanel from '@/components/AdminPanel'
import ThemeToggle from '@/components/ThemeToggle'

const STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-green-500',
  rejected: 'bg-red-500',
  hold: 'bg-yellow-500',
  pending: 'bg-gray-600',
}

const STATUS_BADGE: Record<string, string> = {
  accepted: 'bg-green-500/15 text-green-600 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-600 border-red-500/30',
  hold: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  pending: 'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)]',
}

const STATUS_BTN: Record<string, { active: string; inactive: string }> = {
  accepted: { active: 'bg-green-600 text-white border-transparent', inactive: 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20' },
  rejected: { active: 'bg-red-600 text-white border-transparent', inactive: 'bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/20' },
  hold: { active: 'bg-yellow-600 text-white border-transparent', inactive: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/20' },
  pending: { active: 'bg-[var(--bg-active)] text-[var(--text-primary)] border-transparent', inactive: 'bg-[var(--bg-raised)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]' },
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const { data: authSession, status: authStatus } = useSession()

  const [session, setSession] = useState<Session | null>(null)
  const [banned, setBanned] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [memberCount, setMemberCount] = useState(0)
  const [search, setSearch] = useState('')
  const [idCopied, setIdCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'candidate' | 'list'>('candidate')

  function copySessionId() {
    navigator.clipboard.writeText(sessionId)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 1500)
  }

  const userEmail = authSession?.user?.email ?? ''
  const userName = authSession?.user?.name ?? userEmail

  const isAdmin = !!userEmail && !!session && userEmail === session.created_by

  const loadData = useCallback(async () => {
    const [sessionRes, candidatesRes, membersRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/candidates`),
      fetch(`/api/session-members?session_id=${sessionId}`),
    ])

    // 403 from the session endpoint means this user has been banned.
    if (sessionRes.status === 403) { setBanned(true); return }
    const sessionData = sessionRes.ok ? await sessionRes.json() : null
    const rawCands: Candidate[] = candidatesRes.ok ? await candidatesRes.json() : []
    const membersData = membersRes.ok ? await membersRes.json() : []

    let cands = rawCands.map((c: Candidate) => ({
      ...c,
      data: typeof c.data === 'string' ? JSON.parse(c.data) : c.data,
    }))

    // Merge grader review scores if this session is linked to a round
    if (sessionData?.round_id && cands.some(c => c.applicant_id)) {
      const statsRes = await fetch(`/api/admin/grading-stats?round_id=${sessionData.round_id}`)
      if (statsRes.ok) {
        const stats = await statsRes.json()
        const scoreMap = new Map<string, Record<string, number>>(
          (stats.applicants ?? []).map((a: { applicant_id: string; total: number; r0: number; r1: number; r2: number; r3: number; r4: number; r5: number; r6: number; r7: number; r8: number; r9: number }) => [
            a.applicant_id,
            { score: a.total, r0: a.r0, r1: a.r1, r2: a.r2, r3: a.r3, r4: a.r4, r5: a.r5, r6: a.r6, r7: a.r7, r8: a.r8, r9: a.r9 },
          ])
        )
        cands = cands.map(c => {
          if (!c.applicant_id) return c
          const scores = scoreMap.get(c.applicant_id)
          if (!scores) return c
          return { ...c, data: { ...c.data, ...scores } }
        })
      }
    }

    if (sessionData) setSession(sessionData)
    setCandidates(cands)
    setMemberCount(Array.isArray(membersData) ? membersData.length : 0)

    if (cands.length > 0) {
      const ids = cands.map((c: Candidate) => c.id).join(',')
      const votesRes = await fetch(`/api/votes?candidate_ids=${ids}`)
      const votesData = votesRes.ok ? await votesRes.json() : []
      setVotes(votesData)
    } else {
      setVotes([])
    }
  }, [sessionId])

  useEffect(() => {
    if (authStatus === 'loading') return
    if (authStatus === 'unauthenticated') { router.replace('/'); return }

    loadData().then(() => setLoading(false))

    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [authStatus, sessionId, router, loadData])

  // Auto-join this session on entry — voting and notes require membership,
  // and users can arrive here directly (admin console links, shared URLs)
  // without going through the dashboard's join flow.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !userEmail) return
    fetch('/api/session-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})
  }, [authStatus, userEmail, sessionId])

  // Keep selected in sync when candidates refresh
  useEffect(() => {
    if (selected) {
      const updated = candidates.find(c => c.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [candidates]) // eslint-disable-line react-hooks/exhaustive-deps

  // Match by email when the vote has one (server dedupes by email); fall back
  // to display name for votes cast before email tracking existed.
  const isMyVote = (v: Vote) =>
    v.voter_email ? v.voter_email === userEmail.toLowerCase() : v.voter_name === userName

  async function handleVote(candidateId: string, voteType: VoteType) {
    if (!userEmail) return
    const voterName = userName
    const existing = votes.find(v => v.candidate_id === candidateId && isMyVote(v) && v.vote_type === voteType)
    if (existing) {
      const res = await fetch('/api/votes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Could not remove vote: ${err?.error ?? res.statusText}`)
      }
    } else {
      // Remove the opposite vote first (can't vouch and anti-vouch simultaneously)
      const opposite = voteType === 'vouch' ? 'anti_vouch' : voteType === 'anti_vouch' ? 'vouch' : null
      if (opposite) {
        const oppositeVote = votes.find(v => v.candidate_id === candidateId && isMyVote(v) && v.vote_type === opposite)
        if (oppositeVote) {
          await fetch('/api/votes', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: oppositeVote.id }),
          })
        }
      }
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, voter_name: voterName, vote_type: voteType }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Could not vote: ${err?.error ?? res.statusText}`)
      }
    }
    await loadData()
  }

  async function handleStatusChange(candidateId: string, status: string) {
    await fetch(`/api/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadData()
  }

  async function handleLeaveSession() {
    const msg = isAdmin
      ? 'Leave this session? The session will remain active but you will lose admin controls.'
      : 'Leave this session?'
    if (!confirm(msg)) return
    await fetch('/api/session-members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_email: userEmail }),
    })
    router.push('/dashboard')
  }

  if (authStatus === 'loading' || loading) {
    return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center"><div className="text-gray-500 text-sm">Loading...</div></div>
  }
  if (banned) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-red-400 font-semibold">You have been removed from this session.</p>
          <p className="text-sm text-[var(--text-muted)]">Contact the session creator if you think this is a mistake.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }
  if (!session) {
    return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center"><div className="text-red-400">Session not found.</div></div>
  }

  const myName = userName

  const STATUS_ORDER: Record<string, number> = { accepted: 0, hold: 1, pending: 2, rejected: 3 }

  const filteredCandidates = candidates
    .filter(c => {
      const matchesStatus = filterStatus === 'all' || c.status === filterStatus
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
      return matchesStatus && matchesSearch
    })
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2))

  const votesFor = (id: string) => votes.filter(v => v.candidate_id === id)
  const myVote = (id: string, type: VoteType) =>
    votes.some(v => v.candidate_id === id && isMyVote(v) && v.vote_type === type)

  const statusCounts = {
    all: candidates.length,
    pending: candidates.filter(c => c.status === 'pending').length,
    accepted: candidates.filter(c => c.status === 'accepted').length,
    rejected: candidates.filter(c => c.status === 'rejected').length,
    hold: candidates.filter(c => c.status === 'hold').length,
  }

  return (
    <div className="h-screen bg-[var(--bg-base)] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="min-w-0 flex items-center gap-3">
          <span className="plex-gradient-text text-xs font-bold uppercase tracking-widest hidden sm:block">PlexTech</span>
          <span className="hidden sm:block text-[var(--border)]">|</span>
          <div className="min-w-0">
            <h1 className="font-bold text-[var(--text-primary)] truncate">{session.name}</h1>
            <p className="text-xs text-gray-500">
              ID: <button onClick={copySessionId} className="font-mono font-bold text-[#FF6B35] hover:opacity-70 transition-opacity cursor-pointer" title="Click to copy">{idCopied ? 'Copied!' : sessionId}</button>
              {' · '}{memberCount} members
              {' · '}
              <span className={session.status === 'active' ? 'text-green-600' : 'text-red-500'}>{session.status}</span>
              {session.anonymous && <span className="ml-1 text-yellow-400">· anon</span>}
              {session.role && (
                <span className={`ml-1 ${session.role === 'curriculum' ? 'text-purple-400' : 'text-cyan-400'}`}>· {session.role}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-[var(--text-muted)] hidden sm:block">{myName}</span>
          {/* View toggle */}
          <div className="flex items-center bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('candidate')}
              title="Candidate view"
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'candidate' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          <ThemeToggle />
          <button onClick={handleLeaveSession}
            className="text-xs text-[var(--text-muted)] hover:text-red-400 border border-[var(--border)] hover:border-red-900/60 px-2 py-1.5 rounded-lg transition-colors">
            Leave
          </button>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] px-2 py-1.5 rounded-lg transition-colors">
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
      {viewMode === 'list' ? (
        <ListView
          candidates={candidates}
          votes={votes}
          onSelect={(c) => { setSelected(c); setViewMode('candidate') }}
        />
      ) : (<>

        {/* Left panel — candidate list */}
        <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg-surface)]">
          {/* Admin toggle */}
          {isAdmin && (
            <div className="shrink-0">
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold transition-colors border-b border-[var(--border)] plex-gradient-text hover:opacity-80"
              >
                <span className="uppercase tracking-widest">Admin</span>
                <span className="text-gray-600 text-[10px]">{showAdminPanel ? '▲' : '▼'}</span>
              </button>
              {showAdminPanel && (
                <AdminPanel session={session} sessionId={sessionId} onRefresh={loadData} />
              )}
            </div>
          )}

          {/* Search */}
          <div className="p-3 border-b border-[var(--border)]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search candidates..."
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
            />
          </div>

          {/* Status filters */}
          <div className="flex gap-1 p-2 border-b border-[var(--border)] overflow-x-auto">
            {(['all', 'pending', 'accepted', 'rejected', 'hold'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  filterStatus === s ? 'plex-gradient text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}>
                {s === 'all' ? `All (${statusCounts.all})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${statusCounts[s]})`}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredCandidates.length === 0 ? (
              <div className="text-center text-gray-600 text-sm py-12 px-4">
                {candidates.length === 0 ? 'No candidates yet.\nAdmin can import a CSV.' : 'No matches.'}
              </div>
            ) : (
              filteredCandidates.map(c => {
                const cv = votesFor(c.id)
                const vouches = cv.filter(v => v.vote_type === 'vouch').length
                const antis = cv.filter(v => v.vote_type === 'anti_vouch').length
                const flags = cv.filter(v => v.vote_type === 'red_flag').length
                const isSelected = selected?.id === c.id

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)]/50 transition-colors hover:bg-[var(--bg-raised)]${
                      isSelected ? 'bg-[var(--bg-raised)] border-l-2 border-l-[#FF6B35]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[c.status]}`} />
                      <span className="text-sm text-[var(--text-primary)] font-medium truncate flex-1">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      {c.data.score != null && (
                        <span className="text-xs text-[var(--text-muted)]">{Number(c.data.score).toFixed(1)}</span>
                      )}
                      {c.data.Scores != null && c.data.score == null && (
                        <span className="text-xs text-[var(--text-muted)]">{Number(c.data.Scores).toFixed(1)}</span>
                      )}
                      {vouches > 0 && <span className="text-xs text-green-500">+{vouches}</span>}
                      {antis > 0 && <span className="text-xs text-orange-500">-{antis}</span>}
                      {flags > 0 && <span className="text-xs text-red-500">⚑{flags}</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right panel — detail */}
        <div className="flex-1 overflow-y-auto bg-[var(--bg-base)]">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
              Select a candidate to view their details
            </div>
          ) : (
            <CandidateDetail
              candidate={selected}
              votes={votesFor(selected.id)}
              myName={myName}
              isAdmin={isAdmin}
              anonymous={session.anonymous}
              sessionActive={session.status === 'active'}
              myVote={myVote}
              onVote={handleVote}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      </>)}
      </div>
    </div>
  )
}

function ListView({
  candidates,
  votes,
  onSelect,
}: {
  candidates: Candidate[]
  votes: Vote[]
  onSelect: (c: Candidate) => void
}) {
  const [search, setSearch] = useState('')

  const STATUS_ORDER: Record<string, number> = { accepted: 0, hold: 1, pending: 2, rejected: 3 }

  const filtered = candidates
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2))

  function cvotes(id: string) { return votes.filter(v => v.candidate_id === id) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search candidates..."
          className="w-full max-w-sm bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#FF6B35]"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-surface)] z-10">
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-full">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Score</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-green-500 uppercase tracking-wider">+</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-orange-500 uppercase tracking-wider">−</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wider">⚑</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const cv = cvotes(c.id)
              const vouches = cv.filter(v => v.vote_type === 'vouch').length
              const antis   = cv.filter(v => v.vote_type === 'anti_vouch').length
              const flags   = cv.filter(v => v.vote_type === 'red_flag').length
              const score   = c.data?.score ?? c.data?.Scores

              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-raised)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[c.status]}`} />
                      <span className="font-medium text-[var(--text-primary)]">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_BADGE[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--text-muted)] font-mono">
                    {score != null ? Number(score).toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {vouches > 0 ? <span className="text-green-500 font-medium">{vouches}</span> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {antis > 0 ? <span className="text-orange-500 font-medium">{antis}</span> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {flags > 0 ? <span className="text-red-500 font-medium">{flags}</span> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-[var(--text-muted)] py-16">No candidates found.</div>
        )}
      </div>
    </div>
  )
}

function CandidateDetail({
  candidate, votes, myName, isAdmin, anonymous, sessionActive, myVote, onVote, onStatusChange,
}: {
  candidate: Candidate
  votes: Vote[]
  myName: string
  isAdmin: boolean
  anonymous: boolean
  sessionActive: boolean
  myVote: (id: string, type: VoteType) => boolean
  onVote: (id: string, type: VoteType) => void
  onStatusChange: (id: string, status: string) => void
}) {
  const vouches = votes.filter(v => v.vote_type === 'vouch')
  const antis = votes.filter(v => v.vote_type === 'anti_vouch')
  const flags = votes.filter(v => v.vote_type === 'red_flag')

  const [notes, setNotes] = useState<CandidateNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setNotes([])
    fetch(`/api/candidate-notes?candidate_id=${candidate.id}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setNotes(data))
  }, [candidate.id])

  async function deleteNote(noteId: string) {
    await fetch(`/api/candidate-notes?id=${noteId}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function submitNote(type: 'note' | 'red_flag') {
    const content = noteText.trim()
    if (!content) return
    setSubmitting(true)
    await fetch('/api/candidate-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidate.id, author: myName, content, type }),
    })
    setNoteText('')
    const res = await fetch(`/api/candidate-notes?candidate_id=${candidate.id}`)
    const data = res.ok ? await res.json() : []
    setNotes(data)
    setSubmitting(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Name + status */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{candidate.name}</h2>
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_BADGE[candidate.status]}`}>
          {candidate.status}
        </span>
      </div>

      {/* Dynamic fields from data JSON */}
      <DataFields data={candidate.data} />

      {/* Vote actions */}
      {sessionActive && (
        <div className="mb-6">
          <p className="text-xs text-[var(--text-muted)] mb-2">Your vote</p>
          <div className="flex gap-2">
            {(['vouch', 'anti_vouch'] as VoteType[]).map(type => {
              const active = myVote(candidate.id, type)
              const cfgMap: Record<string, { label: string; active: string; inactive: string }> = {
                vouch: { label: 'Vouch', active: 'bg-green-600 text-white border-transparent', inactive: 'bg-green-950/30 text-green-400 border-green-800 hover:bg-green-900/40' },
                anti_vouch: { label: 'Anti-Vouch', active: 'bg-orange-600 text-white border-transparent', inactive: 'bg-orange-950/30 text-orange-400 border-orange-800 hover:bg-orange-900/40' },
              }
              const cfg = cfgMap[type]
              if (!cfg) return null
              return (
                <button key={type} onClick={() => onVote(candidate.id, type)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${active ? cfg.active : cfg.inactive}`}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Votes summary */}
      {votes.length > 0 && (
        <div className="mb-6 space-y-3">
          {vouches.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-400 mb-1">Vouches ({vouches.length})</p>
              <p className="text-sm text-[var(--text-secondary)]">{anonymous ? `${vouches.length} member(s)` : vouches.map(v => v.voter_name).join(', ')}</p>
            </div>
          )}
          {antis.length > 0 && (
            <div>
              <p className="text-xs font-medium text-orange-400 mb-1">Anti-Vouches ({antis.length})</p>
              <p className="text-sm text-[var(--text-secondary)]">{anonymous ? `${antis.length} member(s)` : antis.map(v => v.voter_name).join(', ')}</p>
            </div>
          )}
          {flags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 mb-1">Red Flags ({flags.length})</p>
              {/* Red flags stay anonymous to everyone but the session creator. */}
              <p className="text-sm text-[var(--text-secondary)]">
                {anonymous || !isAdmin
                  ? `${flags.length} member(s)`
                  : flags.map(v => v.voter_name).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Admin status controls */}
      {isAdmin && sessionActive && (
        <div className="mb-6">
          <p className="text-xs text-[var(--text-muted)] mb-2">Set status</p>
          <div className="flex gap-2 flex-wrap">
            {(['accepted', 'rejected', 'hold', 'pending'] as const).map(s => (
              <button key={s} onClick={() => onStatusChange(candidate.id, s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                  candidate.status === s ? STATUS_BTN[s].active : STATUS_BTN[s].inactive
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="border-t border-[var(--border)] pt-5">
        <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-3">Notes</p>

        {notes.length > 0 && (
          <div className="space-y-2 mb-4">
            {notes.map(note => (
              <div key={note.id} className={`rounded-lg p-3 text-sm border ${
                note.type === 'red_flag'
                  ? 'bg-red-950/20 border-red-900/50'
                  : 'bg-[var(--bg-raised)] border-[var(--border)]'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {note.type === 'red_flag' && (
                    <span className="text-red-400 text-xs font-bold tracking-wide">⚑ RED FLAG</span>
                  )}
                  <span className="text-[var(--text-muted)] text-xs">{note.author}</span>
                  <span className="text-[var(--text-muted)] text-xs">
                    {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}
                  </span>
                  {(note.author === myName || isAdmin) && (
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="ml-auto text-[var(--text-muted)] hover:text-red-400 transition-colors text-xs cursor-pointer"
                      title="Delete note"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className={`text-sm leading-snug ${note.type === 'red_flag' ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                  {note.content}
                </p>
              </div>
            ))}
          </div>
        )}

        {sessionActive ? (
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Write a note..."
              rows={2}
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[#FF6B35] resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => submitNote('note')}
                disabled={submitting || !noteText.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Add Note
              </button>
              <button
                onClick={() => submitNote('red_flag')}
                disabled={submitting || !noteText.trim()}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                ⚑ Red Flag
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)] italic">Session ended — notes are read-only.</p>
        )}
      </div>
    </div>
  )
}

function isUrl(val: string) {
  return val.startsWith('http://') || val.startsWith('https://')
}

function formatValue(val: unknown): string {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : val.toFixed(4).replace(/\.?0+$/, '')
  }
  return String(val)
}

// Rubric criteria from the grading form, grouped for display. Values r1–r9 are
// per-grader z-scores (0 = cohort average); r0 is a raw 1–3 concern rating / 15.
const RUBRIC_GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: 'Essay 1', keys: [['r4', 'Criterion 1'], ['r5', 'Criterion 2']] },
  { title: 'Essay 2', keys: [['r8', 'Criterion 1'], ['r9', 'Criterion 2']] },
  { title: 'Essay 3', keys: [['r6', 'Criterion 1'], ['r7', 'Criterion 2']] },
  { title: 'Resume', keys: [['r1', 'Expressiveness'], ['r2', 'Technical depth'], ['r3', 'Passion for building']] },
]
const RUBRIC_KEYS = new Set(['r0', ...RUBRIC_GROUPS.flatMap(g => g.keys.map(([k]) => k))])

// Diverging bar for a z-score: center = cohort average, right/green = above, left/red = below.
function ZBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(-2, Math.min(2, value))
  const halfWidth = Math.abs(clamped) / 2 * 50 // percent of half-track
  const positive = clamped >= 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 shrink-0 text-[var(--text-muted)] truncate" title={label}>{label}</span>
      <div className="relative flex-1 h-2 rounded-full bg-[var(--bg-raised)] overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--border)]" />
        <div
          className={`absolute top-0 bottom-0 rounded-full ${positive ? 'bg-green-500/70' : 'bg-red-500/70'}`}
          style={positive
            ? { left: '50%', width: `${halfWidth}%` }
            : { right: '50%', width: `${halfWidth}%` }}
        />
      </div>
      <span className={`w-12 shrink-0 text-right font-mono ${positive ? 'text-green-400' : 'text-red-400'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  )
}

function RubricStats({ data }: { data: Record<string, unknown> }) {
  const num = (k: string) => (typeof data[k] === 'number' ? data[k] as number : null)
  const groups = RUBRIC_GROUPS
    .map(g => ({ ...g, rows: g.keys.map(([k, label]) => ({ label, value: num(k) })).filter(r => r.value !== null) }))
    .filter(g => g.rows.length > 0)

  // r0 is stored as (1–3 rating)/15 averaged across graders — recover the 1–3 scale.
  const r0 = num('r0')
  const concern = r0 === null ? null : Math.round(r0 * 15 * 10) / 10
  const concernDisplay = concern === null ? null
    : concern >= 2.5 ? { text: `No concerns (${concern}/3)`, cls: 'bg-green-500/15 text-green-400 border-green-500/30' }
    : concern >= 1.5 ? { text: `Could be a problem (${concern}/3)`, cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' }
    : { text: `RED FLAG (${concern}/3)`, cls: 'bg-red-500/15 text-red-400 border-red-500/30' }

  if (!groups.length && !concernDisplay) return null

  return (
    <div className="bg-[var(--bg-raised)]/60 border border-[var(--border)] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Rubric scores vs. cohort average</p>
        {concernDisplay && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${concernDisplay.cls}`} title="Time commitment assessment from graders">
            Time commitments: {concernDisplay.text}
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
        {groups.map(g => (
          <div key={g.title} className="space-y-1.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">{g.title}</p>
            {g.rows.map(r => <ZBar key={r.label} label={r.label} value={r.value!} />)}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)]">Bars show how this candidate compares to other applicants: right of center = above average, left = below. Scores are normalized per grader.</p>
    </div>
  )
}

function DataFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !RUBRIC_KEYS.has(k))

  const urls = entries.filter(([, v]) => typeof v === 'string' && isUrl(v as string))
  const nonUrl = entries.filter(([, v]) => !(typeof v === 'string' && isUrl(v as string)))

  // Split into compact (numbers / short strings) and long-text (multi-line interview responses)
  const isLongText = (v: unknown) =>
    typeof v === 'string' && (v.length > 80 || v.includes('\n'))
  const compact = nonUrl.filter(([, v]) => !isLongText(v))
  const longText = nonUrl.filter(([, v]) => isLongText(v))

  return (
    <div className="mb-6 space-y-4">
      {compact.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {compact.map(([key, val]) => (
            <div key={key} className="bg-[var(--bg-raised)]/80 border border-[var(--border)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)] mb-0.5 truncate">{key}</p>
              <p className="text-[var(--text-primary)] font-medium text-sm break-words">{formatValue(val)}</p>
            </div>
          ))}
        </div>
      )}

      <RubricStats data={data} />

      {longText.length > 0 && (
        <div className="space-y-2">
          {longText.map(([key, val]) => (
            <details key={key} className="bg-[var(--bg-raised)]/80 border border-[var(--border)] rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--text-muted)] font-medium hover:text-[var(--text-primary)]">
                {key}
              </summary>
              <p className="px-3 pb-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                {String(val)}
              </p>
            </details>
          ))}
        </div>
      )}

      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {urls.map(([key, val]) => (
            <a key={key} href={val as string} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 underline">
              {key} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
