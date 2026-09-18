import type { Metadata } from "next";
import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.notFound.title, robots: { index: false } };

export default function NotFound() {
  return (
    <div className="workspace flex flex-col gap-6">
      <header className="page-heading">
        <h1 className="t-title">{en.notFound.title}</h1>
        <p className="t-body">{en.notFound.body}</p>
      </header>
      <nav className="flex flex-wrap gap-3" aria-label={en.notFound.title}>
        <TransitionLink href="/" className="btn btn-strong">{en.notFound.home}</TransitionLink>
        <TransitionLink href="/learn/" className="btn">{en.notFound.learn}</TransitionLink>
        <TransitionLink href="/practice/" className="btn">{en.notFound.practice}</TransitionLink>
      </nav>
    </div>
  );
}
