'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Session, Candidate, Vote, VoteType, CandidateNote } from '@/lib/types'
import AdminPanel from '@/components/AdminPanel'
import ThemeToggle from '@/components/ThemeToggle'
import type { User } from '@supabase/supabase-js'

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

  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
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

  const isAdmin = user != null && session != null && user.email === session.created_by

  const loadData = useCallback(async () => {
    const [sessionRes, candidatesRes, membersRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('candidates').select('*').eq('session_id', sessionId).order('created_at'),
      supabase.from('session_members').select('user_email').eq('session_id', sessionId),
    ])

    const rawCands = candidatesRes.data ?? []
    const cands = rawCands.map((c: Candidate) => ({
      ...c,
      data: typeof c.data === 'string' ? JSON.parse(c.data) : c.data,
    }))
    if (sessionRes.data) setSession(sessionRes.data)
    setCandidates(cands)
    setMemberCount(membersRes.data?.length ?? 0)

    if (cands.length > 0) {
      const { data: votesData } = await supabase
        .from('votes').select('*')
        .in('candidate_id', cands.map((c: Candidate) => c.id))
      setVotes(votesData ?? [])
    } else {
      setVotes([])
    }
  }, [sessionId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/'); return }
      setUser(data.user)
      loadData().then(() => setLoading(false))
    })

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, loadData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, router, loadData])

  // Keep selected in sync when candidates refresh
  useEffect(() => {
    if (selected) {
      const updated = candidates.find(c => c.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [candidates]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVote(candidateId: string, voteType: VoteType) {
    if (!user) return
    const voterName = user.user_metadata?.full_name ?? user.email ?? ''
    const existing = votes.find(v => v.candidate_id === candidateId && v.voter_name === voterName && v.vote_type === voteType)
    if (existing) {
      await supabase.from('votes').delete().eq('id', existing.id)
    } else {
      await supabase.from('votes').insert({ candidate_id: candidateId, voter_name: voterName, vote_type: voteType })
    }
    await loadData()
  }

  async function handleStatusChange(candidateId: string, status: string) {
    await supabase.from('candidates').update({ status }).eq('id', candidateId)
    await loadData()
  }

  async function handleLeaveSession() {
    const msg = isAdmin
      ? 'Leave this session? The session will remain active but you will lose admin controls.'
      : 'Leave this session?'
    if (!confirm(msg)) return
    await supabase.from('session_members').delete()
      .eq('session_id', sessionId)
      .eq('user_email', user!.email!)
    router.push('/dashboard')
  }

  if (loading) {
    return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center"><div className="text-gray-500 text-sm">Loading...</div></div>
  }
  if (!session) {
    return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center"><div className="text-red-400">Session not found.</div></div>
  }

  const myName = user?.user_metadata?.full_name ?? user?.email ?? ''

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
    votes.some(v => v.candidate_id === id && v.voter_name === myName && v.vote_type === type)

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
          <button onClick={async () => { await supabase.auth.signOut(); router.replace('/') }}
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
    supabase
      .from('candidate_notes')
      .select('*')
      .eq('candidate_id', candidate.id)
      .order('created_at')
      .then(({ data }) => setNotes(data ?? []))
  }, [candidate.id])

  async function submitNote(type: 'note' | 'red_flag') {
    const content = noteText.trim()
    if (!content) return
    setSubmitting(true)
    await supabase.from('candidate_notes').insert({
      candidate_id: candidate.id,
      author: myName,
      content,
      type,
    })
    setNoteText('')
    const { data } = await supabase
      .from('candidate_notes')
      .select('*')
      .eq('candidate_id', candidate.id)
      .order('created_at')
    setNotes(data ?? [])
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${active ? cfg.active : cfg.inactive}`}>
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
              <p className="text-sm text-[var(--text-secondary)]">{anonymous ? `${flags.length} member(s)` : flags.map(v => v.voter_name).join(', ')}</p>
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
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
                  <span className="text-[var(--text-muted)] text-xs ml-auto">
                    {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
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
                className="flex-1 bg-[var(--bg-raised)] hover:bg-[var(--bg-active)] border border-[var(--border)] text-[var(--text-secondary)] text-sm py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                Add Note
              </button>
              <button
                onClick={() => submitNote('red_flag')}
                disabled={submitting || !noteText.trim()}
                className="flex-1 bg-red-950/30 hover:bg-red-900/40 border border-red-900/50 text-red-400 text-sm py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                ⚑ Flag
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

function DataFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')

  const urls = entries.filter(([, v]) => typeof v === 'string' && isUrl(v as string))
  const rest = entries.filter(([, v]) => !(typeof v === 'string' && isUrl(v as string)))

  return (
    <div className="mb-6 space-y-4">
      {/* Non-URL fields as a grid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rest.map(([key, val]) => (
            <div key={key} className="bg-[var(--bg-raised)]/80 border border-[var(--border)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)] mb-0.5 truncate">{key}</p>
              <p className="text-[var(--text-primary)] font-medium text-sm break-words">{formatValue(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* URL fields as links */}
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
