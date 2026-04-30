'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { RecruitmentCycle } from '@/lib/types'
import Image from 'next/image'

export default function ApplyHome() {
  const router = useRouter()
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('recruitment_cycles')
      .select('*')
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        setCycle(data as RecruitmentCycle | null)
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
