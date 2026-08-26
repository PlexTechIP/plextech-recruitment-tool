'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { signIn, useSession } from 'next-auth/react'
import { APPLICATIONS_LAUNCHED } from '@/lib/applicationStatus'

const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian (including Indian subcontinent and Philippines origin)',
  'Black or African American',
  'White',
  'Hispanic or Latino',
  'Middle Eastern',
  'Native American or Other Pacific Islander',
  'Prefer not to answer',
]

interface EssayPrompt { id: string; question_number: number; prompt: string; description: string | null }
interface Cycle { id: string; name: string; accepting_applications: boolean; status: string; application_deadline: string | null }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1]) // strip data URI prefix
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function wordCount(value: string) {
  return value.trim() === '' ? 0 : value.trim().split(/\s+/).length
}

export default function ApplicationForm() {
  const router = useRouter()
  const { data: authSession, status: authStatus } = useSession()
  const applicantVerified = (authSession?.user as { applicantVerified?: boolean } | undefined)?.applicantVerified === true
  const email = authSession?.user?.email?.trim().toLowerCase() ?? ''
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [prompts, setPrompts] = useState<EssayPrompt[]>([])
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [year, setYear] = useState('')
  const [transfer, setTransfer] = useState(false)
  const [major, setMajor] = useState('')
  const [gender, setGender] = useState('')
  const [genderOther, setGenderOther] = useState('')
  const [race, setRace] = useState<string[]>([])
  const [role, setRole] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [linkedin, setLinkedin] = useState('')
  const [website, setWebsite] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [commitments, setCommitments] = useState('')
  const [raceDropdownOpen, setRaceDropdownOpen] = useState(false)
  const raceRef = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!APPLICATIONS_LAUNCHED) {
      router.replace('/apply')
      return
    }

    if (authStatus !== 'authenticated' || !applicantVerified) return

    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/cycles', { cache: 'no-store' })
        if (!res.ok) throw new Error('Unable to load the active recruitment cycle.')
        const cycles: unknown = await res.json()
        if (!Array.isArray(cycles)) throw new Error('The recruitment-cycle response was invalid.')
        const active = cycles.find((candidate): candidate is Cycle => (
          typeof candidate === 'object'
          && candidate !== null
          && typeof candidate.id === 'string'
          && candidate.status === 'active'
          && candidate.accepting_applications === true
        )) ?? null
        if (!active) { router.replace('/apply'); return }

        const pRes = await fetch(`/api/cycles/${active.id}/prompts`, { cache: 'no-store' })
        if (!pRes.ok) throw new Error('Unable to load the application prompts.')
        const promptData: unknown = await pRes.json()
        if (
          !Array.isArray(promptData)
          || promptData.length !== 3
          || promptData.some(prompt => (
            typeof prompt !== 'object'
            || prompt === null
            || typeof prompt.id !== 'string'
            || typeof prompt.question_number !== 'number'
            || typeof prompt.prompt !== 'string'
          ))
        ) {
          throw new Error('The application prompts are incomplete or invalid.')
        }
        if (cancelled) return
        setPrompts(promptData as EssayPrompt[])
        setCycle(active)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load the application.')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [router, authStatus, applicantVerified])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (raceRef.current && !raceRef.current.contains(e.target as Node)) {
        setRaceDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggleRace(option: string) {
    setRace(prev => prev.includes(option) ? prev.filter(r => r !== option) : [...prev, option])
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.firstName = 'required'
    if (!lastName.trim()) e.lastName = 'required'
    if (!email.trim()) e.email = 'required'
    if (!phone.trim()) e.phone = 'required'
    if (!year) e.year = 'required'
    if (!major.trim()) e.major = 'required'
    if (!role) e.role = 'required'
    if (!resumeFile) e.resume = 'required'
    if (race.length === 0) e.race = 'required'
    if (!commitments.trim()) e.commitments = 'required'
    for (const prompt of prompts) {
      const key = `answer_${prompt.id}`
      const val = answers[key] ?? ''
      if (!val.trim()) e[key] = 'required'
      else if (wordCount(val) < 150 || wordCount(val) > 200) e[key] = 'Your answer must be between 150 and 200 words.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) { setSubmitError('Please fill out the required fields above.'); return }
    if (!cycle) return

    setSubmitting(true)
    try {
      // Convert PDF to base64 (same as the original portal)
      const resume_base64 = await fileToBase64(resumeFile!)

      const effectiveGender = gender === 'Other' ? genderOther || 'Other' : gender

      const essays = prompts.map(p => ({
        prompt_id: p.id,
        response: (answers[`answer_${p.id}`] ?? '').trim(),
      }))

      const res = await fetch('/api/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_id: cycle.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          year,
          transfer,
          major: major.trim(),
          gender: effectiveGender,
          race,
          desired_roles: role,
          linkedin: linkedin.trim() || null,
          website: website.trim() || null,
          time_commitment: commitments.trim(),
          resume_base64,
          essays,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Submission failed.')
      }

      const { id } = await res.json()
      router.push(`/apply/success?id=${id}&name=${encodeURIComponent(firstName)}`)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred. Please contact plextech@berkeley.edu.')
    } finally {
      setSubmitting(false)
    }
  }

  if (authStatus === 'loading') return null
  if (authStatus !== 'authenticated' || !applicantVerified) {
    const startSignIn = () => {
      if (window.self !== window.top) {
        window.open('/apply/form', '_blank', 'noopener,noreferrer')
        return
      }
      void signIn('google', { callbackUrl: '/apply/form' })
    }
    return (
      <div className="apply-page">
        <div className="apply-home-card">
          <Image src="/PlexTechLogo.png" alt="PlexTech" width={50} height={50} />
          <h2>Verify your Berkeley email</h2>
          <p>Sign in with your Berkeley Google account before starting your application.</p>
          <button
            type="button"
            className="apply-btn-primary"
            onClick={startSignIn}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }
  if (!cycle) {
    return (
      <div className="apply-page">
        <div className="apply-home-card">
          <Image src="/PlexTechLogo.png" alt="PlexTech" width={50} height={50} />
          <h2>{loadError ? 'Application temporarily unavailable' : 'Loading application…'}</h2>
          {loadError && (
            <>
              <p>{loadError} Please refresh or try again shortly.</p>
              <button type="button" className="apply-btn-primary" onClick={() => window.location.reload()}>
                Refresh
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="apply-page">
      <form className="apply-form-card" onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="apply-btn-primary" onClick={() => router.push('/apply')}>
            Return Home
          </button>
        </div>

        <div className="apply-form-title">
          <Image src="/PlexTechLogo.png" alt="PlexTech" width={80} height={80} />
          <h1>PlexTech Application — {cycle.name}</h1>
          <h4>Thank you for your interest in PlexTech!<br />Please fill out the information below and we will get back to you soon.</h4>
          <p>All applications submitted are final; duplicates will not be accepted.</p>
          {cycle.application_deadline && (
            <p style={{ color: '#ec6f34' }}>
              Applications close on {new Date(cycle.application_deadline).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Los_Angeles' })} PT
            </p>
          )}
        </div>

        <div className="apply-field">
          <label>First Name</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
          {errors.firstName && <p className="apply-warning">{errors.firstName}</p>}
        </div>

        <div className="apply-field">
          <label>Last Name</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
          {errors.lastName && <p className="apply-warning">{errors.lastName}</p>}
        </div>

        <div className="apply-field">
          <label>Berkeley Email</label>
          <input
            type="email"
            value={email}
            readOnly
            aria-readonly="true"
          />
          {errors.email && <p className="apply-warning">{errors.email}</p>}
        </div>

        <div className="apply-field">
          <label>Phone Number</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} />
          {errors.phone && <p className="apply-warning">{errors.phone}</p>}
        </div>

        <div className="apply-field">
          <label>Year</label>
          <select value={year} onChange={e => setYear(e.target.value)}>
            <option value="" disabled>Choose your year:</option>
            {['Freshman', 'Sophomore', 'Junior', 'Senior'].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {errors.year && <p className="apply-warning">{errors.year}</p>}
          <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={transfer}
              onChange={e => setTransfer(e.target.checked)}
            />
            I am a transfer student
          </label>
        </div>

        <div className="apply-field">
          <label>Major</label>
          <input type="text" value={major} onChange={e => setMajor(e.target.value)} />
          {errors.major && <p className="apply-warning">{errors.major}</p>}
        </div>

        <div className="apply-field">
          <label>Gender</label>
          <select value={gender} onChange={e => setGender(e.target.value)}>
            <option value="" disabled>Please select:</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
          {gender === 'Other' && (
            <>
              <label>(If selected &apos;Other,&apos; please specify below:)</label>
              <input type="text" value={genderOther} onChange={e => setGenderOther(e.target.value)} />
            </>
          )}
        </div>

        <div className="apply-field" ref={raceRef}>
          <label>Your Demographic Background</label>
          <p style={{ margin: '0.25rem 0 0.5rem', color: 'grey' }}>Please be ensured that this has absolutely no impact on your application.</p>
          <div className="apply-multiselect" onClick={() => setRaceDropdownOpen(o => !o)}>
            {race.length === 0
              ? <span style={{ color: '#999' }}>Select from below</span>
              : race.map(r => (
                <span key={r} className="apply-chip" onClick={e => { e.stopPropagation(); toggleRace(r) }}>
                  {r} ✕
                </span>
              ))
            }
          </div>
          {raceDropdownOpen && (
            <div className="apply-dropdown">
              {RACE_OPTIONS.map(opt => (
                <div
                  key={opt}
                  className={`apply-dropdown-item${race.includes(opt) ? ' selected' : ''}`}
                  onClick={() => toggleRace(opt)}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
          {errors.race && <p className="apply-warning">{errors.race}</p>}
        </div>

        <div className="apply-field">
          <label>Intended Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="" disabled>Please select:</option>
            <option value="Curriculum Student">Curriculum Student</option>
            <option value="Industry Developer">Industry Developer</option>
          </select>
          {errors.role && <p className="apply-warning">{errors.role}</p>}
        </div>

        <div className="apply-field">
          <label>Resume / CV</label>
          <p style={{ color: 'grey', margin: '0.25rem 0' }}>Please limit your resume to a one-page PDF document. Documents of other formats will not be reviewed.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label className="apply-btn-secondary" style={{ cursor: 'pointer', marginBottom: 0 }}>
              Choose File
              <input
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.type !== 'application/pdf') {
                    setResumeFile(null)
                    setErrors(prev => ({ ...prev, resume: 'Please choose a PDF file.' }))
                  } else if (file.size > 3 * 1024 * 1024) {
                    setResumeFile(null)
                    setErrors(prev => ({ ...prev, resume: 'Max file size is 3MB.' }))
                  } else {
                    setResumeFile(file)
                    setErrors(prev => ({ ...prev, resume: '' }))
                  }
                }}
              />
            </label>
            <span style={{ color: resumeFile ? '#333' : 'grey', fontSize: '0.9rem' }}>
              {resumeFile ? resumeFile.name : 'No file chosen'}
            </span>
          </div>
          {errors.resume && <p className="apply-warning">{errors.resume}</p>}
        </div>

        <div className="apply-field">
          <label>LinkedIn Profile (optional)</label>
          <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
        </div>

        <div className="apply-field">
          <label>Personal Website (optional)</label>
          <input type="text" value={website} onChange={e => setWebsite(e.target.value)} />
        </div>

        {prompts.map(prompt => {
          const key = `answer_${prompt.id}`
          return (
            <div className="apply-field" key={prompt.id}>
              <label>{prompt.prompt}</label>
              {prompt.description && <p style={{ color: 'grey', margin: '0.25rem 0' }}>{prompt.description}</p>}
              <textarea
                value={answers[key] ?? ''}
                maxLength={6000}
                onChange={e => setAnswers(prev => ({ ...prev, [key]: e.target.value }))}
              />
              <p style={{ fontSize: '0.8rem', color: 'grey' }}>{wordCount(answers[key] ?? '')} / 150–200 words</p>
              {errors[key] && <p className="apply-warning">{errors[key]}</p>}
            </div>
          )
        })}

        <div className="apply-field">
          <label>Please tell us about your commitments this semester.</label>
          <p style={{ color: 'grey', margin: '0.25rem 0' }}>
            What classes are you taking this semester? Please let us know any other organizations, employment, or commitments you are involved in this semester.
          </p>
          <p style={{ color: 'grey', margin: '0.25rem 0' }}>(Example: CS61A: xx hours)</p>
          <textarea value={commitments} onChange={e => setCommitments(e.target.value)} />
          {errors.commitments && <p className="apply-warning">{errors.commitments}</p>}
        </div>

        <div style={{ marginBottom: '3rem' }}>
          <button type="submit" className="apply-btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          {submitError && <p className="apply-warning">{submitError}</p>}
        </div>

        <p style={{ color: 'grey', fontSize: '0.85rem' }}>Copyright © 2026 PlexTech All Rights Reserved.</p>
      </form>
    </div>
  )
}
