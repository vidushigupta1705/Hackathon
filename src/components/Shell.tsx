"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  IconAlert,
  IconAnalytics,
  IconClose,
  IconCompass,
  IconFlask,
  IconGraph,
  IconMenu,
  IconOverview,
  IconPullRequest,
  IconQuarantine,
  IconRepo,
  IconSettings,
} from "./Icons";
import Logo from "./Logo";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

type NavItem = { href: string; label: string; Icon: IconComponent };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", Icon: IconOverview },
      { href: "/repositories", label: "Repositories", Icon: IconRepo },
      { href: "/graph", label: "Dependency graph", Icon: IconGraph },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/pull-requests", label: "Pull requests", Icon: IconPullRequest },
      { href: "/breaking-changes", label: "Breaking changes", Icon: IconAlert },
      { href: "/quarantine", label: "Quarantine", Icon: IconQuarantine },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/analytics", label: "Risk & health", Icon: IconAnalytics },
      { href: "/recommendations", label: "Recommendations", Icon: IconCompass },
      { href: "/simulate", label: "Simulator", Icon: IconFlask },
    ],
  },
];

const SETTINGS: NavItem = { href: "/settings", label: "Settings", Icon: IconSettings };

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function NavLink({ item, path, onClick }: { item: NavItem; path: string; onClick?: () => void }) {
  const active = isActive(path, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 px-5 py-1.5 text-[12.5px] transition-colors ${
        active ? "bg-white/[0.035] text-fg" : "text-muted hover:bg-white/[0.02] hover:text-fg"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 bg-signal" />}
      <item.Icon size={15} className={active ? "text-signal" : "text-faint"} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Brand({ size = 20 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} className="text-signal" />
      <span className="text-[13.5px] font-medium tracking-[-0.01em] text-fg">DevImpact</span>
    </span>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const all = [...GROUPS.flatMap((g) => g.items), SETTINGS];
  const current = all.find((i) => isActive(path, i.href));

  return (
    <div className="flex min-h-screen bg-ink">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-ink lg:flex">
        <Link href="/dashboard" className="flex items-center px-5 pb-4 pt-5" aria-label="DevImpact dashboard">
          <Brand />
        </Link>
        <nav className="flex-1 overflow-y-auto pb-4" aria-label="Main">
          {GROUPS.map((group) => (
            <div key={group.label} className="mt-4">
              <div className="eyebrow px-5 pb-2">{group.label}</div>
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} path={path} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-2 pb-4">
          <NavLink item={SETTINGS} path={path} />
          <p className="mt-3 px-5 font-mono text-[10px] leading-relaxed tracking-[0.02em] text-faint">
            Advisory only. DevImpact never changes code without approval.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-ink/90 px-4 backdrop-blur-md lg:hidden">
          <Link href="/dashboard" className="flex items-center" aria-label="DevImpact dashboard">
            <Brand size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="eyebrow max-w-[110px] truncate text-muted">{current?.label ?? ""}</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              className="flex h-9 w-9 items-center justify-center rounded-[5px] border border-line-strong text-muted transition-colors hover:text-fg"
            >
              <IconMenu size={17} />
            </button>
          </div>
        </div>

        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-9">{children}</main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-[276px] max-w-[86%] flex-col border-r border-line bg-ink">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <Link href="/dashboard">
                <Brand size={18} />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-8 w-8 items-center justify-center rounded-[5px] text-muted transition-colors hover:text-fg"
              >
                <IconClose size={17} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3" aria-label="Main">
              {GROUPS.map((group) => (
                <div key={group.label} className="mt-4 first:mt-0">
                  <div className="eyebrow px-4 pb-2">{group.label}</div>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <NavLink item={item} path={path} onClick={() => setOpen(false)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="border-t border-line py-3">
              <NavLink item={SETTINGS} path={path} onClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
