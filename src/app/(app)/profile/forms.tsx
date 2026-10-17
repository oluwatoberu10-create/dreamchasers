"use client";

import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { changePasswordAction, updateProfileAction } from "@/server/actions/auth";

const ZONES = ["Europe/London", "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland", "UTC"];

export function ProfileForm({ user }: { user: { firstName: string; lastName: string; bio: string; timezone: string } }) {
  const zones = ZONES.includes(user.timezone) ? ZONES : [user.timezone, ...ZONES];
  return (
    <ActionForm action={updateProfileAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" defaultValue={user.firstName} className="mt-1.5" required /><FieldMsg name="firstName" /></div>
        <div><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" defaultValue={user.lastName} className="mt-1.5" required /><FieldMsg name="lastName" /></div>
      </div>
      <div><Label htmlFor="bio">About you</Label><Textarea id="bio" name="bio" defaultValue={user.bio} rows={3} className="mt-1.5" placeholder="A sentence or two your teachers will see." /><FieldMsg name="bio" /></div>
      <div><Label htmlFor="timezone">Your timezone</Label>
        <Select id="timezone" name="timezone" defaultValue={user.timezone} className="mt-1.5">{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</Select>
        <FieldMsg name="timezone" hint="Used for notification times. Course deadlines always follow the programme's timezone." />
      </div>
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
      <div><Label htmlFor="currentPassword">Current password</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="mt-1.5" required /><FieldMsg name="currentPassword" /></div>
      <div><Label htmlFor="newPassword">New password</Label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} className="mt-1.5" required /><FieldMsg name="newPassword" hint="At least 10 characters." /></div>
      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </ActionForm>
  );
}
