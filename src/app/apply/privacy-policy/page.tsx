'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPolicy() {
  const router = useRouter()

  return (
    <div className="apply-page">
      <div className="apply-form-card" style={{ maxWidth: '700px' }}>
        <h2>PlexTech Application Platform — Privacy Policy</h2>
        <p style={{ color: 'grey', lineHeight: 1.7 }}>
          By applying to PlexTech, you agree to disclose your email address, your full name,
          and other school-related information.<br />
          None of this information will be used for purposes other than recruitment deliberations,
          and all records will be permanently deleted after the application period.<br />
          For any further inquiries, please contact us at info@plextech.berkeley.edu.
        </p>
        <button className="apply-btn-primary" onClick={() => router.push('/apply')}>
          Return Home
        </button>
      </div>
    </div>
  )
}
