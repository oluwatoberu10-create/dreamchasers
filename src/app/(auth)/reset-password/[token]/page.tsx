import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { Notice } from "@/components/ui/feedback";
import { ResetForm } from "../../forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [valid] = await db.select({ id: authTokens.id }).from(authTokens).where(and(
    eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, "reset_password"),
    isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()),
  )).limit(1);

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Choose a password</h1>
      <p className="mt-1.5 text-[14px] text-[var(--text-muted)]">You'll be signed in straight after.</p>
      <div className="mt-7">
        {valid ? <ResetForm token={token} /> : (
          <Notice tone="warning" title="This link has expired or was already used">
            Ask an administrator for a new link, or <Link href="/login" className="font-semibold underline">go to sign in</Link>.
          </Notice>
        )}
      </div>
    </>
  );
}
