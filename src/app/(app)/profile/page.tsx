import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/utils";
import { pageUser } from "@/server/auth";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const me = await pageUser();
  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardBody className="flex flex-col items-center text-center">
            <Avatar firstName={me.firstName} lastName={me.lastName} size={72} />
            <div className="mt-3 text-[17px] font-bold">{me.firstName} {me.lastName}</div>
            <div className="text-[13px] text-[var(--text-muted)]">{me.email}</div>
            <div className="mt-2"><RoleBadge role={me.role} /></div>
            <dl className="mt-5 w-full space-y-2 border-t border-[var(--border)] pt-4 text-left text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">Member since</dt><dd>{formatDateTime(me.createdAt, me.timezone, { day: "numeric", month: "short", year: "numeric" })}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">Last sign-in</dt><dd>{formatDateTime(me.lastLoginAt, me.timezone)}</dd></div>
            </dl>
            <p className="mt-4 text-[12px] text-[var(--text-subtle)]">Your email is never shown to other learners. Only your name appears in the community.</p>
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title="Your details" /><CardBody><ProfileForm user={{ firstName: me.firstName, lastName: me.lastName, bio: me.bio ?? "", timezone: me.timezone }} /></CardBody></Card>
          <Card><CardHeader title="Password" description="Changing it signs you out on every other device." /><CardBody><PasswordForm /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
