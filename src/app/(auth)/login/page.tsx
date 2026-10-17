import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/server/auth";
import { safeInternalPath } from "@/lib/utils";
import { LoginForm } from "../forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">Sign in to pick up where you left off.</p>
      <div className="mt-7"><LoginForm next={safeInternalPath(next, "") || undefined} /></div>
      <p className="mt-6 text-center text-[13.5px] text-[var(--text-muted)]">
        No account yet? Your programme administrator creates it and sends you a link to set your password.
      </p>
    </>
  );
}
