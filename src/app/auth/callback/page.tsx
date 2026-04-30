'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Completing sign-in...')

  useEffect(() => {
    async function handleCallback() {
      // createBrowserClient may have already exchanged the code automatically.
      // Try it anyway (ignore errors — it's a no-op if already done).
      const code = searchParams.get('code')
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {})
      }

      // Get the session however it was established
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('Sign-in failed. Redirecting...')
        setTimeout(() => router.replace('/'), 2000)
        return
      }

      const email = session.user.email ?? ''

      // Enforce the allowlist and get role
      const { data: match } = await supabase
        .from('authorized_users')
        .select('role')
        .ilike('email', email)
        .maybeSingle()

      if (!match) {
        await supabase.auth.signOut()
        router.replace('/unauthorized')
        return
      }

      // Route graders straight to grading queue; others to dashboard
      router.replace(match.role === 'grader' ? '/grade' : '/dashboard')
    }

    handleCallback()
  }, [searchParams, router])

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-gray-300 text-sm mb-2">{status}</div>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </main>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </main>
    }>
      <CallbackInner />
    </Suspense>
  )
}
