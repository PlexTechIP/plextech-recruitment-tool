// ============================================================
// DELIBERATION (original)
// ============================================================

export type CandidateStatus = 'pending' | 'accepted' | 'rejected' | 'hold'
export type SessionStatus = 'active' | 'ended'
export type VoteType = 'vouch' | 'anti_vouch' | 'red_flag'
export type ApplicantRole = 'curriculum' | 'developer'

export interface Session {
  id: string
  round_id: string | null
  name: string
  created_at: string
  status: SessionStatus
  created_by: string
  anonymous: boolean
  role: ApplicantRole | null
}

export interface Candidate {
  id: string
  session_id: string
  applicant_id: string | null
  name: string
  data: CandidateData
  status: CandidateStatus
  created_at: string
}

export type CandidateData = Record<string, unknown>

export interface Vote {
  id: string
  candidate_id: string
  voter_name: string
  voter_email: string | null // null on votes cast before email tracking
  vote_type: VoteType
}

export interface CandidateNote {
  id: string
  candidate_id: string
  author: string
  content: string
  created_at: string
  type: 'note' | 'red_flag'
}

export interface SessionMember {
  session_id: string
  user_email: string
  joined_at: string
}

// ============================================================
// RECRUITMENT
// ============================================================

export type CycleStatus = 'active' | 'ended'
export type RoundStatus = 'pending' | 'grading' | 'deliberating' | 'ended'
export type GradingType = 'rubric' | 'interview'
export type UserRole = 'grader' | 'leadership' | 'admin'

export interface RecruitmentCycle {
  id: string
  name: string
  status: CycleStatus
  accepting_applications: boolean
  application_deadline: string | null
  created_at: string
}

export interface AuthorizedUser {
  id: string
  email: string
  role: UserRole
  added_by: string | null
  added_at: string
}

export interface Round {
  id: string
  cycle_id: string
  name: string
  order_index: number
  grading_type: GradingType | null
  status: RoundStatus
  interview_form_url: string | null
  role: ApplicantRole | null
  created_at: string
}

export interface Applicant {
  id: string
  cycle_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  year: string | null // Freshman | Sophomore | Junior | Senior (legacy rows: grad year e.g. "2027")
  transfer: boolean | null
  major: string | null
  gender: string | null
  race: string[] | null
  desired_roles: string | null
  linkedin: string | null
  website: string | null
  time_commitment: string | null
  resume_url: string | null
  created_at: string
}

export interface EssayPrompt {
  id: string
  cycle_id: string
  question_number: number
  prompt: string
  description: string | null
  criterion1: string | null
  criterion2: string | null
}

export interface EssayResponse {
  id: string
  applicant_id: string
  prompt_id: string
  response: string
}

export interface GraderAssignment {
  id: string
  round_id: string
  applicant_id: string
  grader_email: string
  assigned_at: string
}

export interface Review {
  id: string
  round_id: string
  applicant_id: string
  grader_email: string
  r0: number | null
  r1: number | null
  r2: number | null
  r3: number | null
  r4: number | null
  r5: number | null
  r6: number | null
  r7: number | null
  r8: number | null
  r9: number | null
  comment0: string | null
  comment1: string | null
  comment2: string | null
  comment3: string | null
  comment4: string | null
  submitted_at: string
}

// Computed score output from evaluateResults()
export interface EvaluatedApplicant {
  applicant_id: string
  first_name: string
  last_name: string
  desired_roles: string | null
  r0: number; r1: number; r2: number; r3: number; r4: number
  r5: number; r6: number; r7: number; r8: number; r9: number
  total: number
}
