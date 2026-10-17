"use client";

import * as React from "react";
import { ActionForm, Dialog, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { startConversationAction } from "@/server/actions/community";

const ROLE = { student: "Learner", teacher: "Teacher", super_admin: "Admin" } as const;

export function NewMessage({ contacts, defaultRecipient, label = "New message", variant = "primary" }: {
  contacts: { id: string; label: string; role: keyof typeof ROLE }[]; defaultRecipient?: string; label?: string; variant?: "primary" | "secondary" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}><Icon name="message" className="h-4 w-4" />{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New message">
        <ActionForm action={startConversationAction} className="space-y-4 pb-5" refresh={false}>
          <div>
            <Label htmlFor="recipientId">To</Label>
            <Select id="recipientId" name="recipientId" defaultValue={defaultRecipient ?? ""} className="mt-1.5" required>
              <option value="" disabled>Choose a person…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.label} — {ROLE[c.role]}</option>)}
            </Select>
            <FieldMsg name="recipientId" />
          </div>
          <div>
            <Label htmlFor="body">Message</Label>
            <Textarea id="body" name="body" rows={5} className="mt-1.5" required placeholder="Write your message…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton pendingLabel="Sending…"><Icon name="send" className="h-4 w-4" />Send</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
