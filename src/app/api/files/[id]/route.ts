import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, attemptFiles, courseResources, courses, files, submissionAttempts, submissions } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";
import { canManageCourse, studentCanViewCourse } from "@/server/policy";
import { INLINE_SAFE, readStoredFile } from "@/server/services/storage";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Streams a private file after checking the viewer may see what it belongs to:
 *   - course material → staff who manage the course, or an enrolled learner who can see it;
 *   - submission file → the learner who submitted it, or staff who manage the course.
 * Anything else is a 404 (not 403), so file ids reveal nothing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();

  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!file) return notFound();

  let allowed = false;
  let downloadable = true;

  const [resource] = await db.select({ r: courseResources, c: courses }).from(courseResources)
    .innerJoin(courses, eq(courses.id, courseResources.courseId)).where(eq(courseResources.fileId, id)).limit(1);
  if (resource) {
    downloadable = resource.r.downloadable;
    allowed = (await canManageCourse(user, resource.c)) || (await studentCanViewCourse(user, resource.c));
  } else {
    const owners = await db.select({ studentId: submissions.studentId, course: courses }).from(attemptFiles)
      .innerJoin(submissionAttempts, eq(submissionAttempts.id, attemptFiles.attemptId))
      .innerJoin(submissions, eq(submissions.id, submissionAttempts.submissionId))
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(courses, eq(courses.id, assignments.courseId))
      .where(eq(attemptFiles.fileId, id)).limit(1);
    const o = owners[0];
    if (o) allowed = o.studentId === user.id || (await canManageCourse(user, o.course));
  }
  if (!allowed) return notFound();

  let bytes: Uint8Array;
  try {
    bytes = await readStoredFile(file);
  } catch (e) {
    console.error("[files] read failed", e);
    return new Response("File unavailable", { status: 503 });
  }

  const wantsInline = new URL(req.url).searchParams.get("inline") === "1" || !downloadable;
  const inline = wantsInline && INLINE_SAFE.has(file.mimeType);
  const name = encodeURIComponent(file.originalName);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Even an inline file can never run script in our origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
