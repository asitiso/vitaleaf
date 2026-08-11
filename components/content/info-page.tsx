import Link from "next/link";

type InfoSection = { title: string; body: string };
type InfoLink = { href: string; label: string };

export function InfoPage({ eyebrow = "VITALEAF GUIDE", title, description, sections, links = [] }: {
  eyebrow?: string; title: string; description: string; sections: readonly InfoSection[]; links?: readonly InfoLink[];
}) {
  return <main className="info-page">
    <header className="info-page__header"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header>
    <div className="info-page__sections">{sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div>
    {links.length ? <nav className="info-page__links" aria-label={`${title} 관련 메뉴`}>{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav> : null}
  </main>;
}
