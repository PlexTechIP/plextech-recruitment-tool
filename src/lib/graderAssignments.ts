export type GraderAssignmentRow = {
  round_id: string
  applicant_id: string
  grader_email: string
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
