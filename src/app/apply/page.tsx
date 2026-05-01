'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Cycle { id: string; name: string; status: string; accepting_applications: boolean }

export default function ApplyHome() {
  const router = useRouter()
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cycles')
      .then(r => r.json())
      .then((cycles: Cycle[]) => {
        const active = cycles.find(c => (c as { status: string }).status === 'active') ?? null
        setCycle(active)
        setLoading(false)
      })
  }, [])

  const accepting = cycle?.accepting_applications ?? false

  return (
    <div className="apply-page">
      <div className="apply-home-card">
        <Image src="/PlexTechLogo.png" alt="PlexTech logo" width={35} height={35} style={{ marginBottom: '0.5rem' }} />
        <h2>Welcome to the PlexTech Application Platform!</h2>
        {loading ? null : accepting ? (
          <h4>If you are an applicant, please proceed to the application form.</h4>
        ) : (
          <h4 style={{ color: '#ec6f34' }}>
            Applications are closed for {cycle?.name ?? 'this semester'}. Thank you for your interest in PlexTech!
          </h4>
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
