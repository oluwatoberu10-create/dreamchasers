import type { IconName } from "@/components/ui/icon";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

type Counts = { notifications: number; messages: number; toGrade?: number };

const learner = (c: Counts): NavSection[] => [{
  items: [
    { href: "/learn", label: "Dashboard", icon: "home", exact: true },
    { href: "/learn/courses", label: "My Courses", icon: "book" },
    { href: "/learn/assignments", label: "Assignments", icon: "edit" },
    { href: "/learn/planner", label: "Planner", icon: "calendar" },
    { href: "/learn/progress", label: "Progress", icon: "trend" },
    { href: "/learn/journal", label: "Journal", icon: "journal" },
    { href: "/messages", label: "Messages", icon: "message", badge: c.messages },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: c.notifications },
    { href: "/profile", label: "Profile", icon: "team" },
  ],
}];

const teaching = (c: Counts): NavItem[] => [
  { href: "/teach", label: "Dashboard", icon: "home", exact: true },
  { href: "/teach/courses", label: "My Courses", icon: "book" },
  { href: "/teach/calendar", label: "Course Calendar", icon: "calendar" },
  { href: "/teach/assignments", label: "Assignments", icon: "edit" },
  { href: "/teach/grading", label: "Submissions & Grading", icon: "checkCircle", badge: c.toGrade },
  { href: "/teach/students", label: "Students", icon: "users" },
];

const teacher = (c: Counts): NavSection[] => [
  { items: teaching(c) },
  { items: [
    { href: "/messages", label: "Messages", icon: "message", badge: c.messages },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: c.notifications },
    { href: "/profile", label: "Profile", icon: "team" },
  ] },
];

const admin = (c: Counts): NavSection[] => [
  { title: "Administration", items: [
    { href: "/admin", label: "Overview", icon: "grid", exact: true },
    { href: "/admin/users", label: "Users", icon: "users", exact: true },
    { href: "/admin/users?role=teacher", label: "Teachers", icon: "graduation" },
    { href: "/admin/users?role=student", label: "Students", icon: "team" },
    { href: "/admin/courses", label: "Courses", icon: "book" },
    { href: "/admin/assignments", label: "Assignments", icon: "edit" },
    { href: "/admin/calendar", label: "Program Calendar", icon: "calendar" },
    { href: "/admin/analytics", label: "Analytics", icon: "chart" },
    { href: "/admin/activity", label: "Activity", icon: "activity" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ] },
  // Super admins teach from the same account.
  { title: "Teaching", items: teaching(c).filter((i) => i.href !== "/teach/calendar") },
  { title: "You", items: [
    { href: "/messages", label: "Messages", icon: "message", badge: c.messages },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: c.notifications },
    { href: "/profile", label: "Profile", icon: "team" },
  ] },
];

export function navFor(role: "student" | "teacher" | "super_admin", counts: Counts): NavSection[] {
  if (role === "super_admin") return admin(counts);
  if (role === "teacher") return teacher(counts);
  return learner(counts);
}
