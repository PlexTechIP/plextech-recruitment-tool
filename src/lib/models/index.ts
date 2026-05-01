import mongoose, { Schema, model, models } from 'mongoose'

// ─── Authorized Users ────────────────────────────────────────
const AuthorizedUserSchema = new Schema({
  email:    { type: String, required: true, unique: true, lowercase: true },
  role:     { type: String, enum: ['grader', 'leadership', 'admin'], default: 'grader' },
  added_by: { type: String, default: null },
  added_at: { type: Date, default: Date.now },
})
export const AuthorizedUser = models.AuthorizedUser || model('AuthorizedUser', AuthorizedUserSchema)

// ─── Recruitment Cycles ──────────────────────────────────────
const RecruitmentCycleSchema = new Schema({
  name:                   { type: String, required: true },
  status:                 { type: String, enum: ['active', 'ended'], default: 'active' },
  accepting_applications: { type: Boolean, default: false },
  created_at:             { type: Date, default: Date.now },
})
export const RecruitmentCycle = models.RecruitmentCycle || model('RecruitmentCycle', RecruitmentCycleSchema)

// ─── Essay Prompts ───────────────────────────────────────────
const EssayPromptSchema = new Schema({
  cycle_id:        { type: Schema.Types.ObjectId, ref: 'RecruitmentCycle', required: true },
  question_number: { type: Number, required: true },
  prompt:          { type: String, required: true },
  description:     { type: String, default: null },
})
EssayPromptSchema.index({ cycle_id: 1, question_number: 1 }, { unique: true })
export const EssayPrompt = models.EssayPrompt || model('EssayPrompt', EssayPromptSchema)

// ─── Applicants ──────────────────────────────────────────────
const ApplicantSchema = new Schema({
  cycle_id:       { type: Schema.Types.ObjectId, ref: 'RecruitmentCycle', required: true },
  first_name:     { type: String, required: true },
  last_name:      { type: String, required: true },
  email:          { type: String, default: null },
  phone:          { type: String, default: null },
  year:           { type: String, default: null },
  major:          { type: String, default: null },
  gender:         { type: String, default: null },
  race:           { type: [String], default: [] },
  desired_roles:  { type: String, default: null },
  linkedin:       { type: String, default: null },
  website:        { type: String, default: null },
  time_commitment:{ type: String, default: null },
  resume_base64:  { type: String, default: null },  // base64-encoded PDF
  created_at:     { type: Date, default: Date.now },
})
export const Applicant = models.Applicant || model('Applicant', ApplicantSchema)

// ─── Essay Responses ─────────────────────────────────────────
const EssayResponseSchema = new Schema({
  applicant_id: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  prompt_id:    { type: Schema.Types.ObjectId, ref: 'EssayPrompt', required: true },
  response:     { type: String, required: true },
})
EssayResponseSchema.index({ applicant_id: 1, prompt_id: 1 }, { unique: true })
export const EssayResponse = models.EssayResponse || model('EssayResponse', EssayResponseSchema)

// ─── Rounds ──────────────────────────────────────────────────
const RoundSchema = new Schema({
  cycle_id:     { type: Schema.Types.ObjectId, ref: 'RecruitmentCycle', required: true },
  name:         { type: String, required: true },
  order_index:  { type: Number, required: true },
  grading_type: { type: String, enum: ['rubric', 'interview', null], default: null },
  status:       { type: String, enum: ['pending', 'grading', 'deliberating', 'ended'], default: 'pending' },
  created_at:   { type: Date, default: Date.now },
})
export const Round = models.Round || model('Round', RoundSchema)

// ─── Grader Assignments ──────────────────────────────────────
const GraderAssignmentSchema = new Schema({
  round_id:     { type: Schema.Types.ObjectId, ref: 'Round', required: true },
  applicant_id: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  grader_email: { type: String, required: true, lowercase: true },
  assigned_at:  { type: Date, default: Date.now },
})
GraderAssignmentSchema.index({ round_id: 1, applicant_id: 1, grader_email: 1 }, { unique: true })
export const GraderAssignment = models.GraderAssignment || model('GraderAssignment', GraderAssignmentSchema)

// ─── Reviews ─────────────────────────────────────────────────
const ReviewSchema = new Schema({
  round_id:     { type: Schema.Types.ObjectId, ref: 'Round', required: true },
  applicant_id: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  grader_email: { type: String, required: true, lowercase: true },
  r0: Number, r1: Number, r2: Number, r3: Number, r4: Number,
  r5: Number, r6: Number, r7: Number, r8: Number, r9: Number,
  comment0: String, comment1: String, comment2: String, comment3: String, comment4: String,
  submitted_at: { type: Date, default: Date.now },
})
ReviewSchema.index({ round_id: 1, applicant_id: 1, grader_email: 1 }, { unique: true })
export const Review = models.Review || model('Review', ReviewSchema)

// ─── Sessions (Deliberation) ─────────────────────────────────
const SessionSchema = new Schema({
  _id:        { type: String },  // 6-char alphanumeric custom ID
  round_id:   { type: Schema.Types.ObjectId, ref: 'Round', default: null },
  name:       { type: String, required: true },
  status:     { type: String, enum: ['active', 'ended'], default: 'active' },
  created_by: { type: String, required: true },
  anonymous:  { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { _id: false })
export const Session = models.Session || model('Session', SessionSchema)

// ─── Candidates ──────────────────────────────────────────────
const CandidateSchema = new Schema({
  session_id:   { type: String, ref: 'Session', required: true },
  applicant_id: { type: Schema.Types.ObjectId, ref: 'Applicant', default: null },
  name:         { type: String, required: true },
  data:         { type: Schema.Types.Mixed, default: {} },
  status:       { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
  created_at:   { type: Date, default: Date.now },
})
export const Candidate = models.Candidate || model('Candidate', CandidateSchema)

// ─── Votes ───────────────────────────────────────────────────
const VoteSchema = new Schema({
  candidate_id: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  voter_name:   { type: String, required: true },
  vote_type:    { type: String, enum: ['vouch', 'anti_vouch', 'red_flag'], required: true },
})
export const Vote = models.Vote || model('Vote', VoteSchema)

// ─── Candidate Notes ─────────────────────────────────────────
const CandidateNoteSchema = new Schema({
  candidate_id: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  author:       { type: String, required: true },
  content:      { type: String, required: true },
  type:         { type: String, enum: ['note', 'red_flag'], default: 'note' },
  created_at:   { type: Date, default: Date.now },
})
export const CandidateNote = models.CandidateNote || model('CandidateNote', CandidateNoteSchema)

// ─── Session Members ─────────────────────────────────────────
const SessionMemberSchema = new Schema({
  session_id: { type: String, ref: 'Session', required: true },
  user_email: { type: String, required: true, lowercase: true },
  joined_at:  { type: Date, default: Date.now },
})
SessionMemberSchema.index({ session_id: 1, user_email: 1 }, { unique: true })
export const SessionMember = models.SessionMember || model('SessionMember', SessionMemberSchema)

// helper: convert mongoose doc to plain object with id string
export function toJSON<T>(doc: mongoose.Document & T): T & { id: string } {
  const obj = doc.toObject({ virtuals: false }) as Record<string, unknown>
  const id = obj._id?.toString() ?? ''
  delete obj._id
  delete obj.__v
  // Convert ObjectId fields to strings
  for (const key of Object.keys(obj)) {
    if (obj[key] instanceof mongoose.Types.ObjectId) {
      obj[key] = (obj[key] as mongoose.Types.ObjectId).toString()
    }
  }
  return { ...obj, id } as T & { id: string }
}
