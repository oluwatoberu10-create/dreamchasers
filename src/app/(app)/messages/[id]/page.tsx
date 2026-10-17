import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/feedback";
import { AppError } from "@/lib/errors";
import { pageUser } from "@/server/auth";
import { readConversation } from "@/server/services/messaging";
import { Thread } from "./thread";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await pageUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let data;
  try {
    data = await readConversation(me.id, id);
  } catch (e) {
    // Not a participant → indistinguishable from a thread that doesn't exist.
    if (e instanceof AppError) notFound();
    throw e;
  }
  const other = data.others[0];
  return (
    <>
      <PageHeader back={{ href: "/messages", label: "Messages" }}
        title={other ? <span className="inline-flex items-center gap-3"><Avatar firstName={other.firstName} lastName={other.lastName} size={40} />{other.firstName} {other.lastName}</span> : "Conversation"}
        actions={other && <RoleBadge role={other.role} />} />
      <Card className="overflow-hidden">
        <Thread conversationId={id} meId={me.id}
          initial={data.messages.map((r) => ({ id: r.m.id, body: r.m.body, senderId: r.m.senderId, createdAt: r.m.createdAt.toISOString(), firstName: r.firstName, lastName: r.lastName }))} />
      </Card>
    </>
  );
}
