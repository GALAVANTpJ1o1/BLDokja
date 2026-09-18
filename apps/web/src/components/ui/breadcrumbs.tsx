import { TransitionLink } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

const SITE_URL = "https://bldokja.pages.dev";

export interface Crumb {
  readonly label: string;
  readonly href: string;
}

/**
 * A trail for pages one level below a top-level section (a trainer under /practice/, a lesson under
 * /learn/, /settings/lettering/). Top-level pages (/practice/, /learn/ themselves) skip this: "Home >
 * Practice" on the Practice page itself repeats what the heading and nav already say.
 *
 * Also emits BreadcrumbList structured data (schema.org/JSON-LD) for search results -- plain JSON of
 * this component's own props, never anything a user typed, so a static script tag is safe here the
 * same way layout.tsx's appearance-boot script is.
 */
export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const full: readonly Crumb[] = [{ label: en.nav.home, href: "/" }, ...trail];
  const last = full.length - 1;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: full.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.label, item: `${SITE_URL}${crumb.href}` })),
  };
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol className="flex flex-wrap items-center gap-2 t-meta text-quiet">
          {full.map((crumb, i) => (
            <li key={crumb.href} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {i === last ? <span aria-current="page">{crumb.label}</span> : <TransitionLink href={crumb.href} className="text-link">{crumb.label}</TransitionLink>}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
