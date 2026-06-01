#!/usr/bin/env node
/**
 * Focused TOCTOU race test: simulate concurrent admins clicking
 * "Start Deliberation" (session POST) and "Advance" (round POST)
 * to verify the new partial-unique indexes are doing their job.
 *
 * Requires server running with TEST_BYPASS_AUTH=1.
 */
import { performance } from 'node:perf_hooks'

const BASE = 'http://127.0.0.1:5173'
const ADMIN = { email: 'race-admin@example.com', role: 'admin' }
const H = { 'content-type': 'application/json', 'x-test-email': ADMIN.email, 'x-test-role': ADMIN.role }

async function api(method, path, body) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const ms = performance.now() - t0
  let data; try { data = await res.json() } catch {}
  return { status: res.status, ok: res.ok, data, ms }
}

async function setup() {
  const cycle = await api('POST', '/api/cycles', {
    name: `TOCTOU-${Date.now()}`, status: 'active', accepting_applications: false,
  })
  const round = await api('POST', '/api/rounds', {
    cycle_id: cycle.data.id, name: 'Race Round', grading_type: 'rubric',
    order_index: 1, status: 'grading', role: null,
  })
  return { cycleId: cycle.data.id, roundId: round.data.id }
}

async function teardown(ctx) {
  await api('DELETE', `/api/rounds/${ctx.roundId}`)
  await api('DELETE', `/api/cycles/${ctx.cycleId}`)
}

// Race 1: Multiple concurrent session creates for the same round + role
async function raceSessionCreate(roundId, role, n = 20) {
  const attempts = Array.from({ length: n }, () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase()
    return api('POST', '/api/sessions', {
      id, round_id: roundId, name: `race-${role}`, status: 'active',
      created_by: ADMIN.email, anonymous: false, role,
    })
  })
  return Promise.all(attempts)
}

// Race 2: Multiple concurrent round creates with same (cycle, role, order_index)
async function raceRoundCreate(cycleId, role, order, n = 20) {
  const attempts = Array.from({ length: n }, (_, i) =>
    api('POST', '/api/rounds', {
      cycle_id: cycleId, name: `race-r${i}`, grading_type: 'interview',
      order_index: order, status: 'pending', role,
    })
  )
  return Promise.all(attempts)
}

async function main() {
  console.log('--- TOCTOU race-condition test ---\n')

  const ctx = await setup()
  console.log(`Setup: cycle=${ctx.cycleId} round=${ctx.roundId}\n`)

  // ----- Session race ---------------------------------------
  console.log('Race 1: 20 concurrent POST /api/sessions for (round, role=curriculum)')
  const sessAttempts = await raceSessionCreate(ctx.roundId, 'curriculum', 20)
  const sessSuccess = sessAttempts.filter(a => a.ok)
  const sessConflict = sessAttempts.filter(a => a.status === 409)
  const sessOther = sessAttempts.filter(a => !a.ok && a.status !== 409)
  console.log(`  ✓ success:   ${sessSuccess.length}  (expected exactly 1)`)
  console.log(`  ⚑ 409:       ${sessConflict.length}`)
  console.log(`  ✗ other err: ${sessOther.length}`)
  if (sessSuccess.length !== 1) {
    console.log('  ⚠️  RACE DETECTED — more than one session was created!')
    sessSuccess.forEach(s => console.log(`     leaked session id=${s.data?.id}`))
  }

  // Clean up the orphan sessions if any
  // (the cascade only runs on round delete, which we'll do in teardown)

  // ----- Round race ----------------------------------------
  console.log('\nRace 2: 20 concurrent POST /api/rounds for (cycle, role=developer, order_index=5)')
  const roundAttempts = await raceRoundCreate(ctx.cycleId, 'developer', 5, 20)
  const rOk = roundAttempts.filter(a => a.ok)
  const r409 = roundAttempts.filter(a => a.status === 409)
  const rOther = roundAttempts.filter(a => !a.ok && a.status !== 409)
  console.log(`  ✓ success:   ${rOk.length}  (expected exactly 1)`)
  console.log(`  ⚑ 409:       ${r409.length}`)
  console.log(`  ✗ other err: ${rOther.length}`)
  if (rOk.length !== 1) {
    console.log('  ⚠️  RACE DETECTED — more than one round was created at the same position!')
    rOk.forEach(r => console.log(`     leaked round id=${r.data?.id}`))
  }

  await teardown(ctx)
  console.log('\nDone.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
