#!/usr/bin/env node
/**
 * Aggressive load test for the deliberation tool.
 *
 * Requires the dev server to be running with `TEST_BYPASS_AUTH=1`:
 *   TEST_BYPASS_AUTH=1 npm run dev
 *
 * Usage:  node scripts/loadtest.mjs
 */

import { performance } from 'node:perf_hooks'
import fs from 'node:fs'

// --- config ---------------------------------------------------------
const BASE = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:5173'
const N_USERS         = 50
const ACTIONS_PER_USER = 200
const N_CANDIDATES    = 20
const LEADERSHIP_FRACTION = 0.2 // 20% leadership, 80% grader

const ACTION_WEIGHTS = [
  ['vote',        50],
  ['unvote',      20],
  ['note',        20],
  ['statusPatch', 10], // leadership only
]

// --- prelude --------------------------------------------------------
// Pull .env.local into process.env so MONGODB_URI is available if we
// ever need it. (We use API-only setup, so this is only informational.)
try {
  const text = fs.readFileSync('.env.local', 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const ADMIN = { email: 'loadtest-admin@example.com', role: 'admin' }

function authHeaders(user) {
  return {
    'content-type': 'application/json',
    'x-test-email': user.email,
    'x-test-role':  user.role,
  }
}

async function api(method, path, user, body) {
  const t0 = performance.now()
  let status = 0, errorBody = ''
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(user),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    status = res.status
    if (!res.ok) {
      try { errorBody = (await res.text()).slice(0, 200) } catch {}
    } else {
      try { var data = await res.json() } catch {}
    }
    return { ok: res.ok, status, data, ms: performance.now() - t0, errorBody }
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - t0, errorBody: err.message ?? String(err) }
  }
}

// --- preflight ------------------------------------------------------
async function preflight() {
  const probe = await fetch(`${BASE}/api/cycles`, { headers: authHeaders(ADMIN) })
  if (probe.status === 401) {
    console.error(`✗ Server is reachable but auth bypass is not active.`)
    console.error(`  Restart the dev server with: TEST_BYPASS_AUTH=1 npm run dev`)
    process.exit(1)
  }
  if (!probe.ok) {
    console.error(`✗ Unexpected probe status: ${probe.status}`)
    process.exit(1)
  }
}

// --- seed -----------------------------------------------------------
async function seed() {
  console.log('Seeding test data via API...')
  const cycleRes = await api('POST', '/api/cycles', ADMIN, {
    name: `LoadTest-${Date.now()}`, status: 'active', accepting_applications: false,
  })
  if (!cycleRes.ok) throw new Error(`cycle create failed: ${cycleRes.status} ${cycleRes.errorBody}`)
  const cycleId = cycleRes.data.id

  const roundRes = await api('POST', '/api/rounds', ADMIN, {
    cycle_id: cycleId, name: 'LoadTest Round', grading_type: null, order_index: 1, status: 'deliberating', role: null,
  })
  if (!roundRes.ok) throw new Error(`round create failed: ${roundRes.status} ${roundRes.errorBody}`)
  const roundId = roundRes.data.id

  const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase()
  const sessRes = await api('POST', '/api/sessions', ADMIN, {
    id: sessionId, round_id: roundId, name: 'LoadTest Deliberation', status: 'active',
    created_by: ADMIN.email, anonymous: false,
  })
  if (!sessRes.ok) throw new Error(`session create failed: ${sessRes.status} ${sessRes.errorBody}`)

  // Build virtual users
  const users = Array.from({ length: N_USERS }, (_, i) => ({
    email: `loaduser${i}@example.com`,
    role: i / N_USERS < LEADERSHIP_FRACTION ? 'leadership' : 'grader',
  }))

  // Join every virtual user as session member
  for (const u of users) {
    const r = await api('POST', '/api/session-members', u, { session_id: sessionId, user_email: u.email })
    if (!r.ok) throw new Error(`session-member join failed for ${u.email}: ${r.status} ${r.errorBody}`)
  }

  // Insert candidates
  const candPayload = Array.from({ length: N_CANDIDATES }, (_, i) => ({
    name: `Candidate ${i + 1}`,
    status: 'pending',
    data: { score: Math.random() * 100, candidate_number: i + 1 },
  }))
  const candRes = await api('POST', `/api/sessions/${sessionId}/candidates`, ADMIN, candPayload)
  if (!candRes.ok) throw new Error(`candidate insert failed: ${candRes.status} ${candRes.errorBody}`)
  const candidateIds = candRes.data.map(c => c.id)

  return { cycleId, roundId, sessionId, candidateIds, users }
}

// --- worker ---------------------------------------------------------
function pickWeighted(weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [k, w] of weights) { r -= w; if (r <= 0) return k }
  return weights[0][0]
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

async function runWorker(user, ctx, metrics) {
  const ownVotes = new Map() // candidateId -> Set of vote_types currently cast
  for (let i = 0; i < ACTIONS_PER_USER; i++) {
    let action = pickWeighted(ACTION_WEIGHTS)
    if (action === 'statusPatch' && user.role === 'grader') action = 'note'

    const candidateId = pick(ctx.candidateIds)
    const t0 = performance.now()
    let res

    if (action === 'vote') {
      const voteType = pick(['vouch', 'anti_vouch', 'red_flag'])
      res = await api('POST', '/api/votes', user, {
        candidate_id: candidateId, voter_name: user.email, vote_type: voteType,
      })
      if (res.ok) {
        if (!ownVotes.has(candidateId)) ownVotes.set(candidateId, new Set())
        ownVotes.get(candidateId).add(voteType)
      }
    } else if (action === 'unvote') {
      // pick a vote we know we cast; if none, fall back to a fresh vote
      const cand = [...ownVotes.entries()].find(([, s]) => s.size > 0)
      if (!cand) { i--; continue }
      const [cId, set] = cand
      const voteType = [...set][0]
      // need vote id — fetch votes for this candidate, find ours
      const list = await api('GET', `/api/votes?candidate_ids=${cId}`, user)
      let voteId
      if (list.ok) {
        const mine = (list.data ?? []).find(v => v.vote_type === voteType && (v.voter_email === user.email || v.voter_name === user.email))
        voteId = mine?.id
      }
      if (!voteId) { i--; continue }
      res = await api('DELETE', '/api/votes', user, { id: voteId })
      if (res.ok) set.delete(voteType)
    } else if (action === 'note') {
      res = await api('POST', '/api/candidate-notes', user, {
        candidate_id: candidateId,
        author: user.email,
        content: `Note from ${user.email} at ${Date.now()}: ${Math.random().toString(36).slice(2)}`,
        type: Math.random() < 0.9 ? 'note' : 'red_flag',
      })
    } else if (action === 'statusPatch') {
      const status = pick(['pending', 'accepted', 'rejected', 'hold'])
      res = await api('PATCH', `/api/candidates/${candidateId}`, user, { status })
    }

    const ms = performance.now() - t0
    const bucket = metrics[action] ?? (metrics[action] = { count: 0, ok: 0, latencies: [], errors: {}, sampleErrors: [] })
    bucket.count++
    bucket.latencies.push(ms)
    if (res?.ok) bucket.ok++
    else {
      const key = res ? `${res.status}` : '0'
      bucket.errors[key] = (bucket.errors[key] ?? 0) + 1
      if (bucket.sampleErrors.length < 3 && res?.errorBody) bucket.sampleErrors.push(`${res.status}: ${res.errorBody}`)
    }
  }
}

// --- main -----------------------------------------------------------
function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

async function teardown(ctx) {
  console.log('Tearing down test data...')
  // Cascade via round deletion (now wipes sessions, members, candidates, votes, notes)
  await api('DELETE', `/api/rounds/${ctx.roundId}`, ADMIN)
  await api('DELETE', `/api/cycles/${ctx.cycleId}`, ADMIN)
}

async function main() {
  await preflight()
  const ctx = await seed()
  console.log(`✓ Seeded session ${ctx.sessionId} with ${ctx.candidateIds.length} candidates and ${ctx.users.length} members`)
  console.log(`Spawning ${N_USERS} concurrent virtual users × ${ACTIONS_PER_USER} actions each...`)

  const metrics = {}
  const t0 = performance.now()
  await Promise.all(ctx.users.map(u => runWorker(u, ctx, metrics)))
  const elapsed = (performance.now() - t0) / 1000

  // Report
  console.log('\n=================== RESULTS ====================')
  console.log(`Total elapsed:        ${elapsed.toFixed(1)}s`)
  let totalReq = 0, totalOk = 0
  for (const k of Object.keys(metrics)) { totalReq += metrics[k].count; totalOk += metrics[k].ok }
  console.log(`Total requests:       ${totalReq}`)
  console.log(`Success rate:         ${((totalOk / totalReq) * 100).toFixed(2)}%`)
  console.log(`Throughput:           ${(totalReq / elapsed).toFixed(0)} req/s`)
  console.log('\nPer-action breakdown:')
  for (const [action, m] of Object.entries(metrics)) {
    const failPct = ((1 - m.ok / m.count) * 100).toFixed(1)
    console.log(`  ${action.padEnd(13)} n=${String(m.count).padEnd(6)} ok=${m.ok}  fail=${failPct}%   p50=${pct(m.latencies, 0.5).toFixed(0)}ms p95=${pct(m.latencies, 0.95).toFixed(0)}ms p99=${pct(m.latencies, 0.99).toFixed(0)}ms`)
    if (Object.keys(m.errors).length) {
      console.log(`     errors by status: ${Object.entries(m.errors).map(([s, c]) => `${s}=${c}`).join(', ')}`)
      for (const e of m.sampleErrors) console.log(`       sample: ${e}`)
    }
  }
  console.log('===============================================\n')

  await teardown(ctx)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
