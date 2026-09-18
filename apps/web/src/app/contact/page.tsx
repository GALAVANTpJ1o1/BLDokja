import type { Metadata } from "next";
import { contact } from "@/i18n/contact";

export const metadata: Metadata = { title: contact.title, description: contact.metaDescription, alternates: { canonical: "/contact/" } };

export default function ContactPage() {
  return (
    <div className="workspace flex flex-col gap-8">
      <header className="page-heading">
        <h1 className="t-title">{contact.title}</h1>
        <p className="t-body">{contact.intro}</p>
      </header>
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="t-meta text-quiet">{contact.emailLabel}</dt>
          <dd><a className="text-link" href={`mailto:${contact.email}`}>{contact.email}</a></dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="t-meta text-quiet">{contact.instagramLabel}</dt>
          <dd><a className="text-link" href={contact.instagramUrl} target="_blank" rel="noreferrer">@{contact.instagramHandle}</a></dd>
        </div>
      </dl>
      <p className="t-meta text-quiet">{contact.responseNote}</p>
    </div>
  );
}
