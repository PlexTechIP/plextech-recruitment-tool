export type GraderAssignmentRow = {
  round_id: string
  applicant_id: string
  grader_email: string
}

export type ReviewerPool = 'regular' | 'leadership'

export type ReassignmentCandidate = {
  assignmentId: string
  applicantId: string
  applicantName: string
  sourceEmail: string
  sourcePool: ReviewerPool
  applicantCompletedReviews: number
  sourcePendingCount: number
}

function uniqueEmails(emails: string[]) {
  return [...new Set(emails.map(email => email.trim().toLowerCase()))]
}

/**
 * Gives every applicant one regular grader and one leadership/admin reviewer,
 * distributing each pool independently with round-robin assignment.
 */
export function buildGraderAssignments({
  roundId,
  applicantIds,
  memberEmails,
  leadershipEmails,
}: {
  roundId: string
  applicantIds: string[]
  memberEmails: string[]
  leadershipEmails: string[]
}): GraderAssignmentRow[] {
  const applicants = [...new Set(applicantIds)]
  const members = uniqueEmails(memberEmails)
  const leadership = uniqueEmails(leadershipEmails)

  if (members.length < 1 || leadership.length < 1) {
    throw new Error('At least one regular grader and one leadership/admin reviewer are required.')
  }
  if (members.some(email => leadership.includes(email))) {
    throw new Error('A reviewer cannot appear in both the regular and leadership pools.')
  }

  const rows: GraderAssignmentRow[] = []
  for (const [index, applicantId] of applicants.entries()) {
    rows.push({
      round_id: roundId,
      applicant_id: applicantId,
      grader_email: members[index % members.length],
    })
    rows.push({
      round_id: roundId,
      applicant_id: applicantId,
      grader_email: leadership[index % leadership.length],
    })
  }

  return rows
}

export function reviewerPoolForRole(role: string): ReviewerPool | null {
  if (role === 'grader') return 'regular'
  if (role === 'leadership' || role === 'admin') return 'leadership'
  return null
}

/**
 * Ranks pending assignments for transfer to a finished grader. The caller is
 * responsible for checking that the target has completed their current queue.
 */
export function rankReassignmentCandidates({
  candidates,
  targetEmail,
  targetPool,
  targetApplicantIds,
}: {
  candidates: ReassignmentCandidate[]
  targetEmail: string
  targetPool: ReviewerPool
  targetApplicantIds: string[]
}): ReassignmentCandidate[] {
  const normalizedTarget = targetEmail.trim().toLowerCase()
  const alreadySeen = new Set(targetApplicantIds)
  const selectedApplicants = new Set<string>()

  return candidates
    .filter(candidate => (
      candidate.sourceEmail.trim().toLowerCase() !== normalizedTarget
      && candidate.sourcePool === targetPool
      && !alreadySeen.has(candidate.applicantId)
    ))
    .sort((a, b) => (
      a.applicantCompletedReviews - b.applicantCompletedReviews
      || b.sourcePendingCount - a.sourcePendingCount
      || a.applicantId.localeCompare(b.applicantId)
      || a.assignmentId.localeCompare(b.assignmentId)
    ))
    .filter(candidate => {
      if (selectedApplicants.has(candidate.applicantId)) return false
      selectedApplicants.add(candidate.applicantId)
      return true
    })
}
