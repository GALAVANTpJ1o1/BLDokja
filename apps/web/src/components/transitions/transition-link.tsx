"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { prefersReducedMotion } from "@/design/motion";
import { runPageTransition, type TransitionDocument } from "./page-transition";

function browserDocument(): TransitionDocument {
  return {
    documentElement: document.documentElement,
    ...(typeof document.startViewTransition === "function" ? { startViewTransition: (update: () => Promise<void> | void) => document.startViewTransition(update) } : {}),
  };
}

type Navigate = (href: string) => void;

const TransitionContext = createContext<Navigate | undefined>(undefined);

/**
 * Wraps client-side navigation in a view transition. The transition's update resolves once the new
 * route has rendered (the pathname changes), with a short timeout so a same-page link can't hang it.
 */
export function PageTransitions({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const waiting = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    waiting.current?.();
    waiting.current = undefined;
  }, [pathname]);

  const navigate = useCallback<Navigate>(
    (href) => {
      void runPageTransition(browserDocument(), prefersReducedMotion(), () =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 600);
          waiting.current = () => {
            clearTimeout(timer);
            resolve();
          };
          router.push(href);
        }),
      );
    },
    [router],
  );

  return <TransitionContext.Provider value={navigate}>{children}</TransitionContext.Provider>;
}

/** A Next.js Link that navigates through a page transition. Modified clicks (new tab and so on) behave normally. */
export function TransitionLink({ href, onClick, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const navigate = useContext(TransitionContext);
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || navigate === undefined) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <Link href={href} onClick={handle} prefetch={false} {...rest} />;
}
