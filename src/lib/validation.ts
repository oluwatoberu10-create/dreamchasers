import { z } from "zod";
import { isDateOnly, isValidTimeZone } from "./dates";

/**
 * Every server action validates its input with these before touching the
 * database. Blank form fields arrive as "", which these helpers map to
 * undefined/null rather than coercing to 0 or an empty string in a column.
 */
const blank = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

export const optText = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max).optional());

export const reqText = (max: number, message = "Required") =>
  z.string().trim().min(1, message).max(max);

export const intField = (min: number, max: number, message?: string) =>
  z.coerce.number({ message: message ?? "Enter a number." }).int("Use a whole number.").min(min, message ?? `Must be at least ${min}.`).max(max, message ?? `Must be at most ${max}.`);

export const optInt = (min: number, max: number) =>
  z.preprocess(blank, z.coerce.number().int().min(min).max(max).optional());

/** HTML checkboxes post "on" when ticked and nothing at all when not. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const uuidField = z.uuid("Invalid reference.");

export const dateOnlyField = z.string().refine(isDateOnly, "Enter a valid date.");
export const timeZoneField = z.string().trim().refine(isValidTimeZone, "Unknown timezone.");

/** "YYYY-MM-DDTHH:mm" from <input type="datetime-local">, interpreted in a programme zone later. */
export const localDateTimeField = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.");

export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).pipe(z.email("Enter a valid email address."));
export const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200, "That password is too long.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Required").max(200),
  next: z.string().optional(),
});

export const profileSchema = z.object({
  firstName: reqText(80),
  lastName: reqText(80),
  bio: optText(600),
  timezone: timeZoneField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: passwordSchema,
});

export const courseSchema = z.object({
  title: reqText(160),
  summary: optText(400),
  content: z.string().max(100_000).default(""),
  objectives: z.string().max(4000).default(""),
  evaluationCriteria: optText(2000),
  trackId: z.preprocess(blank, uuidField.optional()),
  weekId: uuidField,
  teacherId: z.preprocess(blank, uuidField.optional()),
});

export const publishSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("now") }),
  z.object({ mode: z.literal("schedule"), publishAt: localDateTimeField }),
  z.object({ mode: z.literal("draft") }),
]);

export const resourceLinkSchema = z.object({
  courseId: uuidField,
  kind: z.enum(["link", "video"]),
  title: reqText(160),
  url: z.string().trim().max(2000).refine((u) => /^https:\/\//i.test(u) || /^http:\/\//i.test(u), "Links must start with http:// or https://"),
});

export const rubricSchema = z.array(z.object({
  criterion: reqText(120),
  points: z.number().int().min(0).max(1000),
  description: z.string().max(400).optional(),
})).max(20);

export const assignmentSchema = z.object({
  courseId: uuidField,
  kind: z.enum(["assignment", "assessment"]).default("assignment"),
  title: reqText(160),
  instructions: z.string().max(50_000).default(""),
  maxScore: intField(1, 1000),
  passMark: intField(0, 1000),
  dueAt: localDateTimeField,
  allowText: checkbox,
  allowFiles: checkbox,
  requiredFilesNote: optText(400),
  acceptLate: checkbox,
  resubmissionPolicy: z.enum(["none", "on_request", "until_passed"]),
  maxAttempts: optInt(1, 20),
  rubric: z.string().max(20_000).default("[]"),
  publish: checkbox,
}).refine((v) => v.passMark <= v.maxScore, { path: ["passMark"], message: "The pass mark cannot be higher than the maximum score." })
  .refine((v) => v.allowText || v.allowFiles, { path: ["allowText"], message: "Allow a written response, file uploads, or both." });

export const gradeSchema = z.object({
  attemptId: uuidField,
  score: z.coerce.number({ message: "Enter a score." }),
  feedback: z.string().trim().max(10_000).default(""),
  requestRevision: checkbox,
  rubricScores: z.string().max(5000).default("{}"),
});

export const repeatSchema = z.object({
  courseId: uuidField,
  studentId: uuidField,
  reason: reqText(1000, "Say why the learner should revisit this course."),
  guidance: optText(4000),
});

export const journalSchema = z.object({
  weekId: uuidField,
  learned: z.string().max(5000).default(""),
  skills: z.string().max(5000).default(""),
  mostUseful: z.string().max(5000).default(""),
  enjoyedLearning: z.string().max(5000).default(""),
  enjoyedCommunity: z.string().max(5000).default(""),
  difficult: z.string().max(5000).default(""),
  improve: z.string().max(5000).default(""),
  goals: z.string().max(5000).default(""),
});

export const taskSchema = z.object({
  title: reqText(200),
  notes: optText(1000),
  dueOn: z.preprocess(blank, dateOnlyField.optional()),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message.").max(5000),
});

export const programSchema = z.object({
  name: reqText(120),
  description: optText(1000),
  startDate: dateOnlyField,
  weeksCount: intField(1, 26),
  timezone: timeZoneField,
  weekStartDay: intField(0, 6),
  reminderDaysBefore: intField(0, 14),
  reminderHour: intField(0, 23),
});

export const trackSchema = z.object({
  name: reqText(80),
  description: optText(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.").default("#2563eb"),
  weekFrom: intField(1, 26),
  weekTo: intField(1, 26),
}).refine((v) => v.weekTo >= v.weekFrom, { path: ["weekTo"], message: "The last week must be on or after the first." });

export const adminUserSchema = z.object({
  firstName: reqText(80),
  lastName: reqText(80),
  email: emailSchema,
  role: z.enum(["student", "teacher", "super_admin"]),
});

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Splits a textarea of one-per-line items into a clean list. */
export function lines(value: string, max = 20): string[] {
  return value.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, max);
}
