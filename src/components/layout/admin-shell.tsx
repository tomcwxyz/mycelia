import { AdminSidebar } from "./admin-sidebar";

interface AdminShellProps {
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
}

/**
 * The admin console shell — a trimmed sibling of DashboardShell. No org
 * switcher, no moment composer; static platform nav instead. Shares the same
 * ambient parchment washes so it reads as the same product, one layer up.
 */
export function AdminShell({ children, userName, userEmail }: AdminShellProps) {
  return (
    <div className="bg-cream flex min-h-screen flex-col md:flex-row">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          className="animate-hue absolute -top-44 -right-32 h-[560px] w-[560px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(173,184,120,0.4), transparent 65%)",
            animationDuration: "9s",
          }}
        />
        <div
          className="animate-hue absolute -bottom-64 left-32 h-[640px] w-[640px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(232,213,163,0.35), transparent 65%)",
            animationDuration: "12s",
            animationDirection: "alternate-reverse",
          }}
        />
        <div
          className="absolute top-44 -left-48 h-[480px] w-[480px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(205,139,87,0.3), transparent 65%)",
          }}
        />
      </div>

      <AdminSidebar userName={userName} userEmail={userEmail} />

      <div className="flex flex-1 flex-col md:pl-[236px]">
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
