import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, formToObject } from "@/lib/validation";

/**
 * Runs a server action body and converts the outcome into ActionState.
 * AppErrors become user-facing messages; anything unexpected is logged and
 * generalised so database details never reach the browser. Next's own
 * redirect/notFound signals pass straight through.
 */
export async function run(fn: () => Promise<string | ActionState | void>): Promise<ActionState> {
  try {
    const result = await fn();
    if (typeof result === "string") return { ok: true, message: result, at: Date.now() };
    return { ok: true, ...(result ?? {}), at: Date.now() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: fieldErrorsOf(err.details), at: Date.now() };
    // Database constraint/trigger violations: surface a safe message.
    const code = (err as { code?: string })?.code;
    if (code === "23505") return { ok: false, error: "That already exists.", at: Date.now() };
    if (code === "23514") return { ok: false, error: "That change isn't allowed — it would break a platform rule.", at: Date.now() };
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong. Please try again.", at: Date.now() };
  }
}

function fieldErrorsOf(details: unknown): Record<string, string> | undefined {
  return details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, string>) : undefined;
}

/** Parses FormData with a zod schema, throwing a VALIDATION_ERROR with per-field messages. */
export function parse<S extends z.ZodTypeAny>(schema: S, fd: FormData | Record<string, unknown>): z.infer<S> {
  const raw = fd instanceof FormData ? formToObject(fd) : fd;
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fe = fieldErrors(result.error);
    throw new AppError("VALIDATION_ERROR", Object.values(fe)[0] ?? "Please check the form.", fe);
  }
  return result.data;
}
