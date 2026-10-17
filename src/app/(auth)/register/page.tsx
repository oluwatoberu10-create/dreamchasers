import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/server/auth";
import { RegisterForm } from "../forms";

export const metadata = { title: "Create your account" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Join Dream Chasers</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">Free to join — no approval needed. You can start this week's course straight away.</p>
      <div className="mt-7"><RegisterForm /></div>
      <p className="mt-6 text-center text-[13.5px] text-[var(--text-muted)]">
        Already a member? <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">Sign in</Link>
      </p>
    </>
  );
}
