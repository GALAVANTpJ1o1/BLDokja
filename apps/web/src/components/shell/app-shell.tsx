"use client";

import { usePathname } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon, CubeIcon, SlidersHorizontalIcon, ChartLineIcon, TargetIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { TransitionLink as Link } from "@/components/transitions/transition-link";
import { contact } from "@/i18n/contact";
import { en } from "@/i18n/en";
import { explore } from "@/i18n/explore";
import { privacy } from "@/i18n/privacy";
import { GuideButton } from "@/components/guide/guide-button";
import { PageGuide } from "@/components/guide/page-guide";
import { NavigationCube } from "@/components/cube/navigation-cube";
import { redesign } from "@/i18n/redesign";

const SECTIONS = [
  { href: "/learn/", label: en.nav.learn, match: "/learn", icon: BookOpenIcon },
  { href: "/practice/", label: en.nav.practice, match: "/practice", icon: TargetIcon },
  { href: "/progress/", label: en.nav.progress, match: "/progress", icon: ChartLineIcon },
] as const;

const SETTINGS = { href: "/settings/", label: en.nav.settings, match: "/settings", icon: SlidersHorizontalIcon } as const;
const ACCOUNT = { href: "/account/", label: en.nav.account, match: "/account", icon: UserCircleIcon } as const;

function isCurrent(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`);
}


/**
 * A compact top navigation on wide screens and a thumb-reachable bar on phones.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const links = [...SECTIONS, SETTINGS, ACCOUNT].map((s) => <Link key={s.href} href={s.href} aria-current={isCurrent(pathname, s.match) ? "page" : undefined}><s.icon size={20} weight="regular" aria-hidden /><span>{s.label}</span></Link>);
  return (
    <div className="app-room">
      <div className="room-image" aria-hidden />
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ground focus:p-3">
        {en.site.skipToContent}
      </a>

      <header className="shell-header">
        <div className="shell-identity"><NavigationCube signal={pathname} /><Link href="/" className="shell-brand">
          <span>{en.site.name}</span>
        </Link></div>
        <div className="shell-actions"><nav className="shell-nav" aria-label={en.nav.label} data-guide="nav">{links}</nav><GuideButton /></div>
      </header>

      <main id="content" className="page-content shell-main">
        {pathname !== "/" ? <Link className="shell-back" href={pathname.startsWith("/practice/") && pathname !== "/practice/" ? "/practice/" : pathname.startsWith("/learn/") && pathname !== "/learn/" ? "/learn/" : "/"}><ArrowLeftIcon size={15} aria-hidden />{pathname.startsWith("/practice/") && pathname !== "/practice/" ? explore.backPractice : pathname.startsWith("/learn/") && pathname !== "/learn/" ? explore.backLearn : explore.backHome}</Link> : null}
        {children}
        <footer className="shell-footer"><span><CubeIcon size={18} weight="light" aria-hidden />{redesign.footer}</span><span>{redesign.footerNote}</span><span><Link href="/contact/">{contact.title}</Link>{" · "}<Link href="/privacy/">{privacy.title}</Link></span></footer>
      </main>

      <nav aria-label={en.nav.label} className="shell-bottom" data-guide="nav">
        {links}
      </nav>
      <PageGuide />
    </div>
  );
}
