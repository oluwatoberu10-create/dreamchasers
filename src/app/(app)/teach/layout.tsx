import { pageTeacher } from "@/server/auth";

/**
 * Role guard for this section. It runs before the loading boundary below it,
 * so a wrong-role request gets a real HTTP redirect rather than a streamed one.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await pageTeacher();
  return children;
}
