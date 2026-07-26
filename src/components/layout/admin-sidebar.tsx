"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { NavDotLink, type NavItem } from "./sidebar";

const ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Organisations", href: "/admin/organisations" },
  { label: "Usage", href: "/admin/usage" },
  { label: "Feedback", href: "/admin/feedback" },
];

function isAdminNavActive(pathname: string, href: string) {
  // Overview is the admin root — exact match only.
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

interface AdminSidebarProps {
  userName?: string;
  userEmail?: string;
}

export function AdminSidebar({ userName, userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  const initials = userName
    ? userName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <>
      {/* Desktop rail */}
      <aside className="border-border fixed top-0 left-0 z-30 hidden h-screen w-[236px] flex-col border-r bg-white/60 px-[18px] py-[26px] backdrop-blur-xl md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-1">
          <span className="font-display text-bark-dark text-[21px]">
            tending
          </span>
          <span className="bg-bark rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            Admin
          </span>
        </Link>

        <nav className="mt-7 flex flex-1 flex-col gap-1 overflow-y-auto">
          {ADMIN_NAV.map((item) => (
            <NavDotLink
              key={item.href}
              item={item}
              isActive={isAdminNavActive(pathname, item.href)}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1.5 pt-4">
          <Link
            href="/"
            className="text-bark-light rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors hover:bg-white/85"
          >
            ← Back to app
          </Link>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="focus-visible:ring-terracotta flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-white">
                <span className="from-amber to-terracotta flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white">
                  {initials}
                </span>
                <span className="text-bark-light truncate text-xs">
                  {userName ?? userEmail ?? "Account"}
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                side="top"
                sideOffset={8}
                className="border-border bg-surface shadow-hover z-50 min-w-[200px] rounded-xl border p-1.5"
              >
                {userEmail && (
                  <div className="text-muted px-3 py-2 text-xs">
                    {userEmail}
                  </div>
                )}
                <DropdownMenu.Item
                  onSelect={() => signOut({ callbackUrl: "/" })}
                  className="text-bark hover:bg-cream-dark focus:bg-cream-dark cursor-pointer rounded-md px-3 py-2 text-sm transition-colors outline-none"
                >
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="border-border sticky top-0 z-30 flex items-center gap-2 border-b bg-white/80 px-3 py-2.5 backdrop-blur-xl md:hidden">
        <Link href="/admin" className="flex shrink-0 items-center gap-1.5">
          <span className="font-display text-bark-dark text-lg">tending</span>
          <span className="bg-bark rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase">
            Admin
          </span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
                isAdminNavActive(pathname, item.href)
                  ? "bg-bark text-white"
                  : "text-bark-light hover:bg-cream-dark"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="from-amber to-terracotta focus-visible:ring-terracotta flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
            >
              {initials}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              side="bottom"
              sideOffset={8}
              className="border-border bg-surface shadow-hover z-50 min-w-[200px] rounded-xl border p-1.5"
            >
              {userEmail && (
                <div className="text-muted px-3 py-2 text-xs">
                  {userEmail}
                </div>
              )}
              <DropdownMenu.Item asChild>
                <Link
                  href="/"
                  className="text-bark hover:bg-cream-dark focus:bg-cream-dark block cursor-pointer rounded-md px-3 py-2 text-sm transition-colors outline-none"
                >
                  ← Back to app
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => signOut({ callbackUrl: "/" })}
                className="text-bark hover:bg-cream-dark focus:bg-cream-dark cursor-pointer rounded-md px-3 py-2 text-sm transition-colors outline-none"
              >
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </>
  );
}
