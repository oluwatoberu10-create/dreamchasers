/**
 * One error shape for every API route and server action (§67).
 * Database errors are never surfaced verbatim — they are logged and replaced
 * with a generic INTERNAL_ERROR.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  PROVIDER_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (m = "You must be signed in.") => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m = "You do not have access to this resource.") => new AppError("FORBIDDEN", m);
export const notFound = (m = "The requested record could not be found.") => new AppError("NOT_FOUND", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);
export const validationError = (m: string, details?: unknown) => new AppError("VALIDATION_ERROR", m, details);

export type ApiFailure = { success: false; error: { code: ErrorCode; message: string; details?: unknown } };
export type ApiSuccess<T> = { success: true; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function toFailure(err: unknown): { body: ApiFailure; status: number } {
  if (err instanceof AppError) {
    return {
      body: { success: false, error: { code: err.code, message: err.message, details: err.details } },
      status: err.status,
    };
  }
  // Anything unexpected is logged server-side and generalised for the client.
  console.error("[unhandled]", err);
  return {
    body: { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    status: 500,
  };
}

/** Wraps an API route handler so every thrown AppError becomes a JSON envelope. */
export function apiHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<unknown>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      const data = await fn(...args);
      if (data instanceof Response) return data;
      return Response.json({ success: true, data } satisfies ApiSuccess<unknown>);
    } catch (err) {
      const { body, status } = toFailure(err);
      return Response.json(body, { status });
    }
  };
}
