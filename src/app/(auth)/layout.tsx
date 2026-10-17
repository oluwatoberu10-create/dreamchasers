import { Logo } from "@/components/brand";
import { Icon } from "@/components/ui/icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,480px)]">
      <aside className="relative hidden overflow-hidden bg-[var(--nav-bg)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 15% 85%, rgba(245,165,36,.16), transparent 40%), radial-gradient(circle at 90% 10%, rgba(63,79,216,.5), transparent 50%)" }} />
        <Logo inverted className="relative" />
        <div className="relative max-w-md">
          <Icon name="star" className="mb-5 h-7 w-7 text-[#f5a524]" />
          <p className="text-[26px] font-bold leading-snug tracking-tight">“Every week I could see exactly what to learn, what was due and how I was doing. The feedback made me better.”</p>
          <p className="mt-4 text-[14px] text-[#aab2e6]">How a Dream Chasers week feels</p>
        </div>
        <p className="relative text-[12.5px] text-[#8e96c8]">Weekly courses · Assignments & feedback · Progress · Reflection</p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
