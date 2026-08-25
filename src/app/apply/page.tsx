'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { APPLICATIONS_LAUNCHED } from '@/lib/applicationStatus'

interface Cycle { id: string; name: string; status: string; accepting_applications: boolean; application_deadline: string | null }

const APPLICATIONS_OPEN_AT = new Date('2026-08-26T00:00:00-07:00').getTime()

export default function ApplyHome() {
  const router = useRouter()
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/cycles')
      .then(r => r.json())
      .then((cycles: Cycle[]) => {
        const active = cycles.find(c => (c as { status: string }).status === 'active') ?? null
        setCycle(active)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const updateCountdown = () => setNow(Date.now())
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)

    return () => window.clearInterval(interval)
  }, [])

  const accepting = APPLICATIONS_LAUNCHED && (cycle?.accepting_applications ?? false)
  const remainingMilliseconds = Math.max(0, APPLICATIONS_OPEN_AT - (now ?? APPLICATIONS_OPEN_AT))
  const remainingSeconds = Math.floor(remainingMilliseconds / 1000)
  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60

  return (
    <div className="apply-page">
      <div className="apply-home-card">
        <Image src="/PlexTechLogo.png" alt="PlexTech logo" width={35} height={35} style={{ marginBottom: '0.5rem' }} />
        <h2>Welcome to the PlexTech Application Platform!</h2>
        {loading ? null : accepting ? (
          <>
            <h4>If you are an applicant, please proceed to the application form.</h4>
            {cycle?.application_deadline && (
              <p style={{ color: '#ec6f34', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Applications close on {new Date(cycle.application_deadline).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Los_Angeles' })} PT
              </p>
            )}
          </>
        ) : (
          <div style={{ color: '#ec6f34' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Time until applications open</h4>
            <p
              aria-live="polite"
              aria-label={`${days} days, ${hours} hours, ${minutes} minutes, and ${seconds} seconds until applications open`}
              style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}
            >
              {now === null
                ? '--d --h --m --s'
                : `${days}d ${hours}h ${minutes}m ${seconds}s`}
            </p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Applications open August 26 at 12:00 AM Pacific Time.
            </p>
          </div>
        )}

        <div style={{ paddingTop: '15px', paddingLeft: '15px' }}>
          {accepting && (
            <button className="apply-btn-primary" onClick={() => router.push('/apply/form')}>
              Application Form
            </button>
          )}
          <button className="apply-btn-secondary" onClick={() => router.push('/')}>
            Member Login
          </button>
        </div>
      </div>

      <footer style={{ textAlign: 'center', marginTop: '2rem', color: 'grey', fontSize: '0.85rem' }}>
        Copyright © 2024 PlexTech All Rights Reserved. &nbsp;·&nbsp;
        <span
          style={{ textDecoration: 'underline', cursor: 'pointer' }}
          onClick={() => router.push('/apply/privacy-policy')}
        >
          Privacy Policy
        </span>
      </footer>
    </div>
  )
}
