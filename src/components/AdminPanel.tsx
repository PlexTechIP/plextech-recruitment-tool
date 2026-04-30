'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Session } from '@/lib/types'
import { parseDelibCSV } from '@/lib/csv'

interface Props {
  session: Session
  sessionId: string
  onRefresh: () => void
}

export default function AdminPanel({ session, sessionId, onRefresh }: Props) {
  const [tab, setTab] = useState<'session' | 'emails'>('session')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [ending, setEnding] = useState(false)
  const [togglingAnon, setTogglingAnon] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function copySessionId() {
    navigator.clipboard.writeText(sessionId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Email management state
  const [authorizedEmails, setAuthorizedEmails] = useState<{ id: string; email: string; added_by: string }[]>([])
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [bulkEmails, setBulkEmails] = useState('')
  const [showBulk, setShowBulk] = useState(false)

  useEffect(() => {
    if (tab === 'emails') loadEmails()
  }, [tab])

  async function loadEmails() {
    setEmailsLoading(true)
    const { data } = await supabase.from('authorized_emails').select('id, email, added_by').order('added_at')
    setAuthorizedEmails(data ?? [])
    setEmailsLoading(false)
  }

  async function addEmail(emailInput: string) {
    const email = emailInput.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setEmailError('Enter a valid email address.')
      return
    }
    const adminEmail = session.created_by
    const { error } = await supabase.from('authorized_emails').insert({ email, added_by: adminEmail })
    if (error) {
      setEmailError(error.code === '23505' ? 'That email is already authorized.' : error.message)
    } else {
      setNewEmail('')
      setEmailError('')
      await loadEmails()
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault()
    await addEmail(newEmail)
  }

  async function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault()
    const emails = bulkEmails.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes('@'))
    if (emails.length === 0) { setEmailError('No valid emails found.'); return }
    const adminEmail = session.created_by
    const rows = emails.map(email => ({ email: email.toLowerCase(), added_by: adminEmail }))
    await supabase.from('authorized_emails').upsert(rows, { onConflict: 'email' })
    setBulkEmails('')
    setShowBulk(false)
    setEmailError('')
    await loadEmails()
  }

  async function removeEmail(id: string) {
    await supabase.from('authorized_emails').delete().eq('id', id)
    await loadEmails()
  }

  async function importFromText(text: string) {
    setImporting(true)
    setImportStatus('Parsing...')
    let candidates: ReturnType<typeof parseDelibCSV>
    try {
      candidates = parseDelibCSV(text)
    } catch {
      setImportStatus('Error parsing CSV.')
      setImporting(false)
      return
    }
    if (candidates.length === 0) {
      setImportStatus('No candidates found.')
      setImporting(false)
      return
    }
    setImportStatus(`Importing ${candidates.length} candidates...`)
    const rows = candidates.map(c => ({ session_id: sessionId, name: c.name, data: c.data, status: 'pending' }))
    const { error } = await supabase.from('candidates').insert(rows)
    if (error) {
      setImportStatus('Import failed: ' + error.message)
    } else {
      setImportStatus(`Imported ${candidates.length} candidates.`)
      await onRefresh()
    }
    setImporting(false)
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await importFromText(text)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handlePasteImport(e: React.FormEvent) {
    e.preventDefault()
    if (!csvText.trim()) return
    await importFromText(csvText)
    setCsvText('')
    setShowPaste(false)
  }

  async function toggleAnonymous() {
    setTogglingAnon(true)
    await supabase.from('sessions').update({ anonymous: !session.anonymous }).eq('id', sessionId)
    await onRefresh()
    setTogglingAnon(false)
  }

  async function handleEndSession() {
    if (!confirm('End this session? Members will no longer be able to vote.')) return
    setEnding(true)
    await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId)
    await onRefresh()
    setEnding(false)
  }

  async function handleReactivate() {
    await supabase.from('sessions').update({ status: 'active' }).eq('id', sessionId)
    await onRefresh()
  }

  async function handleClearCandidates() {
    if (!confirm('Delete ALL candidates and votes? This cannot be undone.')) return
    const { data: cands } = await supabase.from('candidates').select('id').eq('session_id', sessionId)
    if (cands?.length) await supabase.from('votes').delete().in('candidate_id', cands.map((c: { id: string }) => c.id))
    await supabase.from('candidates').delete().eq('session_id', sessionId)
    await onRefresh()
    setImportStatus('All candidates cleared.')
  }

  return (
    <div className="flex flex-col border-b border-[var(--border)]">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          <button
            onClick={() => setTab('session')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === 'session' ? 'text-[var(--text-primary)] border-b-2 border-[#FF6B35]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Session
          </button>
          <button
            onClick={() => setTab('emails')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === 'emails' ? 'text-[var(--text-primary)] border-b-2 border-[#FF6B35]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Emails
          </button>
        </div>

        <div className="overflow-y-auto max-h-[50vh]">
          {tab === 'session' ? (
            <div className="p-4 space-y-4">
              {/* Session ID */}
              <button
                onClick={copySessionId}
                className="w-full bg-[var(--bg-raised)] hover:bg-[var(--bg-active)] border border-[var(--border)] rounded-lg p-3 text-sm text-left transition-colors group"
              >
                <p className="text-gray-500 text-xs mb-1 flex items-center justify-between">
                  <span>Session ID — click to copy</span>
                  <span className={`text-xs transition-colors ${copied ? 'text-green-400' : 'text-gray-600 group-hover:text-gray-400'}`}>
                    {copied ? 'Copied!' : 'Copy'}
                  </span>
                </p>
                <p className="font-mono font-bold text-[#FF6B35] text-xl tracking-widest">{sessionId}</p>
              </button>

              {/* Import CSV */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Import Candidates</label>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVImport} disabled={importing || session.status === 'ended'} className="hidden" id="csv-upload" />
                  <label
                    htmlFor="csv-upload"
                    className={`flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium cursor-pointer ${importing || session.status === 'ended' ? 'bg-[var(--bg-raised)] text-gray-600 cursor-not-allowed' : 'plex-gradient text-white'}`}
                  >
                    {importing ? 'Importing...' : 'Upload File'}
                  </label>
                  <button
                    onClick={() => setShowPaste(!showPaste)}
                    disabled={importing || session.status === 'ended'}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-raised)] hover:bg-[var(--bg-active)] border border-[var(--border)] text-[var(--text-muted)] transition-colors disabled:opacity-40"
                  >
                    Paste
                  </button>
                </div>
                {showPaste && (
                  <form onSubmit={handlePasteImport} className="mt-2 space-y-2">
                    <textarea
                      value={csvText}
                      onChange={e => setCsvText(e.target.value)}
                      placeholder="Paste CSV data here..."
                      rows={6}
                      className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] text-xs font-mono focus:outline-none focus:border-[#FF6B35] resize-none"
                    />
                    <button type="submit" disabled={importing || !csvText.trim()}
                      className="w-full plex-gradient disabled:opacity-40 text-white text-sm py-2 rounded-lg">
                      Import Pasted CSV
                    </button>
                  </form>
                )}
                {importStatus && (
                  <p className={`text-xs mt-2 ${importStatus.includes('failed') || importStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {importStatus}
                  </p>
                )}
              </div>

              {/* Anonymous toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Anonymous Mode</p>
                  <p className="text-xs text-[var(--text-muted)]">Hide voter names</p>
                </div>
                <button
                  onClick={toggleAnonymous}
                  disabled={togglingAnon}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer group ${session.anonymous ? 'plex-gradient hover:opacity-80' : 'bg-[#1e2035] hover:bg-[#252545]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all group-hover:scale-110 shadow-sm ${session.anonymous ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Clear */}
              <button
                onClick={handleClearCandidates}
                disabled={session.status === 'ended'}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/50 transition-colors disabled:opacity-40"
              >
                Clear All Candidates & Votes
              </button>

              {/* End / reactivate */}
              <div className="border-t border-[var(--border)] pt-4">
                {session.status === 'active' ? (
                  <button onClick={handleEndSession} disabled={ending} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                    {ending ? 'Ending...' : 'End Session'}
                  </button>
                ) : (
                  <button onClick={handleReactivate} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-700 hover:bg-green-600 text-white transition-colors">
                    Reactivate Session
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">
                Only these emails can sign in. If the list is empty, anyone with Google can access the tool.
              </p>

              {/* Add single email */}
              <form onSubmit={handleAddEmail} className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => { setNewEmail(e.target.value); setEmailError('') }}
                  placeholder="email@berkeley.edu"
                  className="flex-1 bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[#FF6B35]"
                />
                <button type="submit" className="plex-gradient text-white text-sm px-3 py-2 rounded-lg shrink-0">
                  Add
                </button>
              </form>

              {/* Bulk add */}
              <div>
                <button
                  onClick={() => setShowBulk(!showBulk)}
                  className="text-xs text-[#FF6B35] hover:opacity-80"
                >
                  {showBulk ? 'Hide bulk add' : '+ Bulk add (paste list)'}
                </button>
                {showBulk && (
                  <form onSubmit={handleBulkAdd} className="mt-2 space-y-2">
                    <textarea
                      value={bulkEmails}
                      onChange={e => setBulkEmails(e.target.value)}
                      placeholder="One email per line, or comma-separated"
                      rows={4}
                      className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[#FF6B35] resize-none"
                    />
                    <button type="submit" className="w-full plex-gradient text-white text-sm py-2 rounded-lg">
                      Add All
                    </button>
                  </form>
                )}
              </div>

              {emailError && <p className="text-red-400 text-xs">{emailError}</p>}

              {/* Email list */}
              {emailsLoading ? (
                <p className="text-[var(--text-muted)] text-sm text-center py-4">Loading...</p>
              ) : authorizedEmails.length === 0 ? (
                <p className="text-[var(--text-muted)] text-sm text-center py-4">No emails yet — all Google users can access.</p>
              ) : (
                <ul className="space-y-1">
                  {authorizedEmails.map(({ id, email }) => (
                    <li key={id} className="flex items-center justify-between gap-2 bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2">
                      <span className="text-sm text-[var(--text-secondary)] truncate">{email}</span>
                      <button
                        onClick={() => removeEmail(id)}
                        className="text-red-400 hover:text-red-300 text-xs shrink-0 transition-colors"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
    </div>
  )
}
