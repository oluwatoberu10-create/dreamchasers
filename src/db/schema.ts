/**
 * Dream Chasers Community — relational schema.
 *
 * Design rules that the rest of the code relies on:
 *
 *  - A student has at most ONE `submissions` row per assignment (unique). It is
 *    the "case file". Every piece of work handed in is a separate, append-only
 *    `submission_attempts` row, and every grading decision is a `grades` row
 *    tied to exactly one attempt. Resubmitting or repeating a course therefore
 *    never overwrites an earlier score or piece of feedback.
 *  - `grades` snapshots the max score and pass mark that applied when the work
 *    was graded, so later changes to an assignment do not rewrite history.
 *  - Course visibility is driven by `status` + `publish_at`; see
 *    src/server/policy.ts for the single definition of "visible to students".
 *  - Score ranges, pass-mark ranges and per-week uniqueness are enforced by
 *    CHECK / UNIQUE constraints, not just by application code.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb,
  uniqueIndex, index, check, primaryKey,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/* ── enums ───────────────────────────────────────────────────────────── */

export const userRole = pgEnum("user_role", ["student", "teacher", "super_admin"]);
export const userStatus = pgEnum("user_status", ["active", "deactivated"]);
export const tokenPurpose = pgEnum("token_purpose", ["verify_email", "reset_password"]);
export const programStatus = pgEnum("program_status", ["draft", "active", "completed", "archived"]);
export const courseStatus = pgEnum("course_status", ["draft", "scheduled", "published", "archived"]);
export const resourceKind = pgEnum("resource_kind", ["file", "link", "video"]);
export const assignmentKind = pgEnum("assignment_kind", ["assignment", "assessment"]);
export const assignmentStatus = pgEnum("assignment_status", ["draft", "published", "archived"]);
export const resubmissionPolicy = pgEnum("resubmission_policy", ["none", "on_request", "until_passed"]);
export const submissionStatus = pgEnum("submission_status", [
  "in_progress",        // a draft attempt exists, nothing handed in yet for this attempt
  "submitted",          // latest attempt handed in, waiting for a teacher
  "graded",             // latest attempt graded (passed or not passed)
  "revision_requested", // latest attempt graded and the teacher asked for another go
]);
export const attemptStatus = pgEnum("attempt_status", ["draft", "submitted", "graded"]);
export const gradeOutcome = pgEnum("grade_outcome", ["passed", "not_passed", "revision_requested"]);
export const repeatStatus = pgEnum("repeat_status", ["active", "completed", "cancelled"]);
export const journalStatus = pgEnum("journal_status", ["draft", "submitted"]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "sent",        // provider accepted the message (we have its id)
  "failed",      // provider rejected or errored after retries
  "logged",      // no provider configured: written to the log only, NOT delivered
]);
export const notificationType = pgEnum("notification_type", [
  "course_published",
  "course_scheduled",
  "resource_added",
  "assignment_submitted",
  "assignment_graded",
  "revision_requested",
  "repeat_required",
  "deadline_approaching",
  "assignment_overdue",
  "message_received",
  "role_changed",
  "system",
]);

/* ── identity ────────────────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: id(),
  email: text().notNull(),
  passwordHash: text().notNull(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  bio: text(),
  role: userRole().notNull().default("student"),
  status: userStatus().notNull().default("active"),
  timezone: text().notNull().default("UTC"),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  lastLoginAt: timestamp({ withTimezone: true }),
  deactivatedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
  index("users_role_idx").on(t.role),
]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text().notNull(),
  userAgent: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("sessions_token_uq").on(t.tokenHash),
  index("sessions_user_idx").on(t.userId),
]);

export const authTokens = pgTable("auth_tokens", {
  id: id(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: tokenPurpose().notNull(),
  tokenHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  consumedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash)]);

/** Fixed-window counters. Lives in Postgres so limits hold across serverless instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull().default(0),
});

/* ── programme structure ─────────────────────────────────────────────── */

export const programs = pgTable("programs", {
  id: id(),
  name: text().notNull(),
  description: text(),
  status: programStatus().notNull().default("draft"),
  /** Exactly one programme may be current; new students are enrolled into it. */
  isCurrent: boolean().notNull().default(false),
  /** Local date (in `timezone`) on which week 1 begins. */
  startDate: date().notNull(),
  weeksCount: integer().notNull().default(12),
  /** IANA zone used for every week boundary and reminder calculation. */
  timezone: text().notNull().default("Europe/London"),
  /** 0 = Sunday … 6 = Saturday. `startDate` must fall on this day. */
  weekStartDay: integer().notNull().default(1),
  /** Teachers are reminded this many days before a week starts. */
  reminderDaysBefore: integer().notNull().default(3),
  /** Local hour (0–23) from which that day's reminder may be sent. */
  reminderHour: integer().notNull().default(9),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("programs_weeks_ck", sql`${t.weeksCount} between 1 and 26`),
  check("programs_week_start_ck", sql`${t.weekStartDay} between 0 and 6`),
  check("programs_reminder_days_ck", sql`${t.reminderDaysBefore} between 0 and 14`),
  check("programs_reminder_hour_ck", sql`${t.reminderHour} between 0 and 23`),
  uniqueIndex("programs_one_current_uq").on(t.isCurrent).where(sql`${t.isCurrent}`),
]);

export const programWeeks = pgTable("program_weeks", {
  id: id(),
  programId: uuid().notNull().references(() => programs.id, { onDelete: "cascade" }),
  weekNumber: integer().notNull(),
  title: text().notNull(),
  theme: text(),
  startsOn: date().notNull(),
  endsOn: date().notNull(),
}, (t) => [
  uniqueIndex("program_weeks_uq").on(t.programId, t.weekNumber),
  check("program_weeks_range_ck", sql`${t.endsOn} >= ${t.startsOn}`),
]);

/** Students (and only students) are enrolled into a programme to see its courses. */
export const enrollments = pgTable("enrollments", {
  programId: uuid().notNull().references(() => programs.id, { onDelete: "cascade" }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  enrolledAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.programId, t.studentId] }),
  index("enrollments_student_idx").on(t.studentId),
]);

/**
 * A subject strand within a programme (e.g. "Maths", "Creative Writing").
 * Each track expects one published course per week between weekFrom and weekTo,
 * delivered by the teachers in `track_teachers`.
 */
export const tracks = pgTable("tracks", {
  id: id(),
  programId: uuid().notNull().references(() => programs.id, { onDelete: "cascade" }),
  name: text().notNull(),
  description: text(),
  color: text().notNull().default("#2563eb"),
  weekFrom: integer().notNull().default(1),
  weekTo: integer().notNull().default(12),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("tracks_name_uq").on(t.programId, t.name),
  check("tracks_weeks_ck", sql`${t.weekFrom} >= 1 and ${t.weekTo} >= ${t.weekFrom}`),
]);

/** Teaching responsibility: who must publish the weekly course for a track. */
export const trackTeachers = pgTable("track_teachers", {
  trackId: uuid().notNull().references(() => tracks.id, { onDelete: "cascade" }),
  teacherId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.trackId, t.teacherId] }),
  index("track_teachers_teacher_idx").on(t.teacherId),
]);

/* ── courses & materials ─────────────────────────────────────────────── */

export const courses = pgTable("courses", {
  id: id(),
  programId: uuid().notNull().references(() => programs.id, { onDelete: "cascade" }),
  trackId: uuid().notNull().references(() => tracks.id, { onDelete: "restrict" }),
  weekId: uuid().notNull().references(() => programWeeks.id, { onDelete: "restrict" }),
  /** The teacher presenting the course (shown to students). */
  teacherId: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  createdById: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text().notNull(),
  summary: text(),
  /** Markdown. Rendered through the escaping renderer in src/lib/markdown.ts. */
  content: text().notNull().default(""),
  objectives: jsonb().$type<string[]>().notNull().default([]),
  evaluationCriteria: text(),
  status: courseStatus().notNull().default("draft"),
  publishAt: timestamp({ withTimezone: true }),
  publishedAt: timestamp({ withTimezone: true }),
  archivedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("courses_week_idx").on(t.weekId),
  index("courses_track_week_idx").on(t.trackId, t.weekId),
  index("courses_teacher_idx").on(t.teacherId),
  check("courses_scheduled_ck", sql`${t.status} <> 'scheduled' or ${t.publishAt} is not null`),
]);

/** Uploaded file metadata. The bytes live in the storage driver, never in the DB. */
export const files = pgTable("files", {
  id: id(),
  ownerId: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  driver: text().notNull(),
  storageKey: text().notNull(),
  originalName: text().notNull(),
  mimeType: text().notNull(),
  sizeBytes: integer().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("files_key_uq").on(t.driver, t.storageKey)]);

export const courseResources = pgTable("course_resources", {
  id: id(),
  courseId: uuid().notNull().references(() => courses.id, { onDelete: "cascade" }),
  kind: resourceKind().notNull(),
  title: text().notNull(),
  url: text(),
  fileId: uuid().references(() => files.id, { onDelete: "restrict" }),
  /** Whether students may download the file (otherwise inline view only). */
  downloadable: boolean().notNull().default(true),
  position: integer().notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index("course_resources_course_idx").on(t.courseId),
  check("course_resources_target_ck", sql`(${t.url} is not null) or (${t.fileId} is not null)`),
]);

/** Per-student course activity. Completion is self-reported by the learner. */
export const courseProgress = pgTable("course_progress", {
  courseId: uuid().notNull().references(() => courses.id, { onDelete: "cascade" }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  firstViewedAt: createdAt(),
  lastViewedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp({ withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.courseId, t.studentId] })]);

/* ── assignments, submissions, grading ───────────────────────────────── */

export type RubricItem = { criterion: string; points: number; description?: string };

export const assignments = pgTable("assignments", {
  id: id(),
  courseId: uuid().notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdById: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  kind: assignmentKind().notNull().default("assignment"),
  title: text().notNull(),
  instructions: text().notNull().default(""),
  maxScore: integer().notNull().default(100),
  passMark: integer().notNull().default(50),
  dueAt: timestamp({ withTimezone: true }).notNull(),
  allowText: boolean().notNull().default(true),
  allowFiles: boolean().notNull().default(false),
  /** What the learner must attach, shown next to the upload control. */
  requiredFilesNote: text(),
  acceptLate: boolean().notNull().default(true),
  resubmissionPolicy: resubmissionPolicy().notNull().default("on_request"),
  /** Cap on attempts; null = no cap. */
  maxAttempts: integer(),
  rubric: jsonb().$type<RubricItem[]>().notNull().default([]),
  status: assignmentStatus().notNull().default("draft"),
  publishedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("assignments_course_idx").on(t.courseId),
  index("assignments_due_idx").on(t.dueAt),
  check("assignments_max_ck", sql`${t.maxScore} between 1 and 1000`),
  check("assignments_pass_ck", sql`${t.passMark} between 0 and ${t.maxScore}`),
  check("assignments_mode_ck", sql`${t.allowText} or ${t.allowFiles}`),
  check("assignments_attempts_ck", sql`${t.maxAttempts} is null or ${t.maxAttempts} >= 1`),
]);

export const submissions = pgTable("submissions", {
  id: id(),
  assignmentId: uuid().notNull().references(() => assignments.id, { onDelete: "restrict" }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  status: submissionStatus().notNull().default("in_progress"),
  /** Number of the newest attempt (1-based). */
  currentAttempt: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("submissions_student_assignment_uq").on(t.assignmentId, t.studentId),
  index("submissions_student_idx").on(t.studentId),
  index("submissions_status_idx").on(t.status),
]);

export const submissionAttempts = pgTable("submission_attempts", {
  id: id(),
  submissionId: uuid().notNull().references(() => submissions.id, { onDelete: "cascade" }),
  attemptNumber: integer().notNull(),
  body: text().notNull().default(""),
  status: attemptStatus().notNull().default("draft"),
  submittedAt: timestamp({ withTimezone: true }),
  /** Handed in after the deadline. Set once, at submission, never recomputed. */
  isLate: boolean().notNull().default(false),
  /** Why this attempt exists when it is not the first (revision, repeat, retry). */
  reason: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("attempts_number_uq").on(t.submissionId, t.attemptNumber),
  check("attempts_number_ck", sql`${t.attemptNumber} >= 1`),
  check("attempts_submitted_ck", sql`${t.status} = 'draft' or ${t.submittedAt} is not null`),
]);

export const attemptFiles = pgTable("attempt_files", {
  attemptId: uuid().notNull().references(() => submissionAttempts.id, { onDelete: "cascade" }),
  fileId: uuid().notNull().references(() => files.id, { onDelete: "restrict" }),
}, (t) => [primaryKey({ columns: [t.attemptId, t.fileId] })]);

export const grades = pgTable("grades", {
  id: id(),
  attemptId: uuid().notNull().references(() => submissionAttempts.id, { onDelete: "cascade" }),
  score: integer().notNull(),
  maxScore: integer().notNull(),
  passMark: integer().notNull(),
  outcome: gradeOutcome().notNull(),
  feedback: text().notNull().default(""),
  rubricScores: jsonb().$type<Record<string, number>>().notNull().default({}),
  gradedById: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  gradedAt: createdAt(),
}, (t) => [
  uniqueIndex("grades_attempt_uq").on(t.attemptId),
  check("grades_score_ck", sql`${t.score} >= 0 and ${t.score} <= ${t.maxScore}`),
  check("grades_pass_ck", sql`${t.passMark} between 0 and ${t.maxScore}`),
  // passed / not passed must agree with the numbers. A teacher may ask for a
  // revision at any score, so that outcome is unconstrained.
  check("grades_outcome_ck", sql`${t.outcome} = 'revision_requested' or ((${t.outcome} = 'passed') = (${t.score} >= ${t.passMark}))`),
]);

/**
 * "Keep learning" — a teacher asks a learner to revisit a course. Never
 * deletes or resets anything: it unlocks new attempts on the course's
 * assignments and records why.
 */
export const repeatRequirements = pgTable("repeat_requirements", {
  id: id(),
  courseId: uuid().notNull().references(() => courses.id, { onDelete: "cascade" }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  requiredById: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  reason: text().notNull(),
  guidance: text(),
  status: repeatStatus().notNull().default("active"),
  resolvedById: uuid().references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("repeat_one_active_uq").on(t.courseId, t.studentId).where(sql`${t.status} = 'active'`),
  index("repeat_student_idx").on(t.studentId),
]);

/** A teacher's end-of-week comment. The numbers themselves are always derived live. */
export const weeklyEvaluations = pgTable("weekly_evaluations", {
  id: id(),
  weekId: uuid().notNull().references(() => programWeeks.id, { onDelete: "cascade" }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  comment: text().notNull(),
  evaluatedById: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("weekly_evaluations_uq").on(t.weekId, t.studentId)]);

/* ── reflection & planning ───────────────────────────────────────────── */

export type JournalResponses = Partial<Record<
  "learned" | "skills" | "mostUseful" | "enjoyedLearning" | "enjoyedCommunity" | "difficult" | "improve" | "goals",
  string
>>;

export const journalEntries = pgTable("journal_entries", {
  id: id(),
  studentId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  weekId: uuid().notNull().references(() => programWeeks.id, { onDelete: "cascade" }),
  responses: jsonb().$type<JournalResponses>().notNull().default({}),
  status: journalStatus().notNull().default("draft"),
  submittedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("journal_one_per_week_uq").on(t.studentId, t.weekId)]);

/** Learner-created tasks. Assignment to-dos are derived, not stored (no sync drift). */
export const personalTasks = pgTable("personal_tasks", {
  id: id(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text().notNull(),
  notes: text(),
  dueOn: date(),
  completedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("personal_tasks_user_idx").on(t.userId)]);

/* ── notifications & messaging ───────────────────────────────────────── */

export const notifications = pgTable("notifications", {
  id: id(),
  recipientId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationType().notNull(),
  title: text().notNull(),
  body: text().notNull().default(""),
  /** In-app path. Pages re-check access, so a stale link can never leak data. */
  link: text(),
  resourceType: text(),
  resourceId: uuid(),
  /** Same event processed twice → same key → one row. */
  dedupeKey: text().notNull(),
  readAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("notifications_dedupe_uq").on(t.recipientId, t.dedupeKey),
  index("notifications_inbox_idx").on(t.recipientId, t.createdAt),
  index("notifications_unread_idx").on(t.recipientId).where(sql`${t.readAt} is null`),
]);

export const conversations = pgTable("conversations", {
  id: id(),
  /** Sorted "<uuid>:<uuid>" for one-to-one threads, so each pair has one thread. */
  pairKey: text().notNull(),
  subject: text(),
  lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("conversations_pair_uq").on(t.pairKey)]);

export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: uuid().notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp({ withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.conversationId, t.userId] }),
  index("participants_user_idx").on(t.userId),
]);

export const messages = pgTable("messages", {
  id: id(),
  conversationId: uuid().notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
  body: text().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  check("messages_body_ck", sql`length(${t.body}) between 1 and 5000`),
]);

/* ── reminders & jobs ────────────────────────────────────────────────── */

/**
 * One row per (teacher, track, week) course-upload reminder. The unique key is
 * what stops a reminder being sent twice. Reminders are in-app notifications.
 */
export const teacherReminders = pgTable("teacher_reminders", {
  id: id(),
  programId: uuid().notNull().references(() => programs.id, { onDelete: "cascade" }),
  weekId: uuid().notNull().references(() => programWeeks.id, { onDelete: "cascade" }),
  trackId: uuid().notNull().references(() => tracks.id, { onDelete: "cascade" }),
  teacherId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  status: deliveryStatus().notNull().default("pending"),
  attempts: integer().notNull().default(0),
  lastError: text(),
  sentAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("teacher_reminders_uq").on(t.weekId, t.trackId, t.teacherId)]);

/** Record of every scheduled-job run, for the admin reminders page. */
export const jobRuns = pgTable("job_runs", {
  id: id(),
  job: text().notNull(),
  trigger: text().notNull(),
  startedAt: createdAt(),
  finishedAt: timestamp({ withTimezone: true }),
  ok: boolean(),
  summary: jsonb().$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("job_runs_started_idx").on(t.startedAt)]);

/* ── administration ──────────────────────────────────────────────────── */

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: uuid().references(() => users.id, { onDelete: "set null" }),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text(),
  summary: text().notNull(),
  metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [
  index("audit_logs_created_idx").on(t.createdAt),
  index("audit_logs_entity_idx").on(t.entityType, t.entityId),
]);

export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedById: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
