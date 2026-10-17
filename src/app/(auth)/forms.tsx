"use client";

import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Input, Label } from "@/components/ui/field";
import { loginAction, registerAction, resetPasswordAction } from "@/server/actions/auth";

function F({ name, label, type = "text", autoComplete, hint, ...rest }: { name: string; label: string; type?: string; autoComplete?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} autoComplete={autoComplete} className="mt-1.5" required {...rest} />
      <FieldMsg name={name} hint={hint} />
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-4" refresh={false}>
      {next && <input type="hidden" name="next" value={next} />}
      <F name="email" label="Email" type="email" autoComplete="email" />
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" className="mt-1.5" required />
        <FieldMsg name="password" hint="Forgotten it? Ask an administrator for a reset link." />
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm() {
  return (
    <ActionForm action={registerAction} className="space-y-4" refresh={false}>
      <div className="grid grid-cols-2 gap-3">
        <F name="firstName" label="First name" autoComplete="given-name" />
        <F name="lastName" label="Last name" autoComplete="family-name" />
      </div>
      <F name="email" label="Email" type="email" autoComplete="email" />
      <F name="password" label="Password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating your account…">Create account</SubmitButton>
      <p className="text-center text-[12px] text-[var(--text-subtle)]">You'll join as a learner. Teachers are added by the programme team.</p>
    </ActionForm>
  );
}

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4" refresh={false}>
      <input type="hidden" name="token" value={token} />
      <F name="password" label="New password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." />
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">Save password and sign in</SubmitButton>
    </ActionForm>
  );
}
