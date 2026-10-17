"use client";

import * as React from "react";
import Link from "next/link";
import { ActionForm, Dialog, FieldMsg, SubmitButton, useFormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { createUserAction } from "@/server/actions/admin";
import { ShareLink } from "./share-link";

function Result() {
  const s = useFormState();
  if (!s.ok || !s.data) return null;
  return (
    <div className="space-y-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-[13px]">
      <p className="font-semibold text-[var(--success)]">{s.message}</p>
      {typeof s.data.invitePath === "string" && <ShareLink path={s.data.invitePath} label="Set-password link" />}
      <Link href={`/admin/users/${s.data.userId}`} className="inline-block font-semibold text-[var(--brand)] underline">Open their profile</Link>
    </div>
  );
}

export function CreateUser() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" />Add user</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a user" description="You'll get a one-time link to share with them so they can set their own password.">
        <ActionForm action={createUserAction} className="space-y-4 pb-5" resetOnSuccess>
          <Result />
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cu-first">First name</Label><Input id="cu-first" name="firstName" className="mt-1.5" required /><FieldMsg name="firstName" /></div>
            <div><Label htmlFor="cu-last">Last name</Label><Input id="cu-last" name="lastName" className="mt-1.5" required /><FieldMsg name="lastName" /></div>
          </div>
          <div><Label htmlFor="cu-email">Email</Label><Input id="cu-email" name="email" type="email" className="mt-1.5" required /><FieldMsg name="email" /></div>
          <div><Label htmlFor="cu-role">Role</Label>
            <Select id="cu-role" name="role" defaultValue="teacher" className="mt-1.5"><option value="student">Learner</option><option value="teacher">Teacher</option><option value="super_admin">Super admin</option></Select>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button><SubmitButton pendingLabel="Creating…">Create account</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
