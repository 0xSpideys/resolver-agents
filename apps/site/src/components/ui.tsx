import Link from "next/link";
import { nav, project } from "@/lib/project";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-edge bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Link href="/" className="font-mono text-sm font-medium tracking-tight">
          {project.name}
        </Link>
        <nav className="flex items-center gap-5">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-3xl border-t border-edge px-5 py-10 text-sm text-muted sm:px-8">
      <p>
        {project.name} — {project.tagline}.
      </p>
      <p className="mt-2 font-mono text-xs">
        {project.repo ? (
          <a className="text-accent underline underline-offset-4" href={project.repo}>
            {project.repo}
          </a>
        ) : (
          "Source repository is private."
        )}
      </p>
    </footer>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 sm:px-8">{children}</div>;
}

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  first = false,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 py-12 sm:py-16 ${first ? "" : "border-t border-edge"}`}
    >
      {eyebrow ? (
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{lead}</p>
      ) : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-edge bg-surface p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.82em]">
      {children}
    </code>
  );
}

/** Long contract ids and hashes: never let them widen the page. */
export function Hash({ value, label }: { value: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-2 px-3 py-2">
      {label ? (
        <span className="block font-mono text-[0.7rem] uppercase tracking-wider text-muted">
          {label}
        </span>
      ) : null}
      <span className="mt-0.5 block truncate font-mono text-xs">{value}</span>
    </div>
  );
}
