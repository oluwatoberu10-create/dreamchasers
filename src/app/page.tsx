import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { getCurrentUser, homeFor } from "@/server/auth";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "calendar", title: "A new course every week", body: "Twelve to thirteen weeks of structured learning. Each week's course opens on schedule, with materials, objectives and a clear plan." },
  { icon: "edit", title: "Assignments with real feedback", body: "Hand in written work or files. Teachers grade against a clear pass mark and tell you exactly what to do next." },
  { icon: "repeat", title: "Room to improve", body: "Didn't pass yet? Revise and resubmit, or revisit a course. Every attempt is kept so you can see how far you've come." },
  { icon: "trend", title: "Progress you can see", body: "Weekly evaluations and a three-month tracker built from your real results — never guesses." },
  { icon: "journal", title: "A weekly reflection journal", body: "Write down what you learned, what was hard and what you'll aim for next. Private by default." },
  { icon: "message", title: "Teachers who follow up", body: "Message your teachers, get reminders before deadlines, and never miss a new course." },
];

export default async function Landing() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh bg-[var(--nav-bg)] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo inverted />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink href={homeFor(user)} variant="star" size="sm">Go to your dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="star" size="sm">Sign in</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(245,165,36,.18), transparent 35%), radial-gradient(circle at 80% 0%, rgba(63,79,216,.45), transparent 45%)" }} />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12.5px] font-semibold text-[#d9ddf5]">
            <Icon name="star" className="h-3.5 w-3.5 text-[#f5a524]" /> A learning community for dreamers who do the work
          </p>
          <h1 className="max-w-3xl text-[38px] font-extrabold leading-[1.08] tracking-tight sm:text-[56px]">
            Learn something new every week. <span className="text-[#f5a524]">See yourself improve.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[#c3c8e6]">
            Dream Chasers Community brings weekly courses, assignments, teacher feedback, progress tracking and reflection into one place — for a focused three-month programme.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={user ? homeFor(user) : "/login"} variant="star" size="lg">{user ? "Continue learning" : "Sign in"}</ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg)] text-[var(--text)]">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card anim-rise p-6" style={{ "--stagger": `${i * 60}ms` } as React.CSSProperties}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Icon name={f.icon} className="h-5 w-5" /></div>
              <h2 className="text-[16px] font-bold">{f.title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.body}</p>
            </div>
          ))}
        </div>
        <footer className="border-t border-[var(--border)] py-8 text-center text-[13px] text-[var(--text-subtle)]">
          © {new Date().getFullYear()} Dream Chasers Community
        </footer>
      </section>
    </div>
  );
}
