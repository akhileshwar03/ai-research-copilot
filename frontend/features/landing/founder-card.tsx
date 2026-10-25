"use client";

import { buildApiUrl } from "@/constants/config";
import { Reveal } from "@/features/shared/motion/motion";
import { useFounder, type FounderLink, type FounderPublic } from "@/features/landing/use-founder";

const ICONS: Record<FounderLink["kind"], React.ReactNode> = {
  linkedin: (
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
  ),
  github: (
    <path d="M12 .5a11.5 11.5 0 00-3.64 22.41c.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0012 .5z" />
  ),
  x: (
    <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25H8.1l4.71 6.23 5.43-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
  ),
  website: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.2-2.4 3.3-5.4 3.3-9S14.2 5.4 12 3m0 18c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3M3.6 9h16.8M3.6 15h16.8"
    />
  ),
};

/**
 * The founder's note: a real person, a real photo (only if one was uploaded), and their own words.
 * Presentational on purpose: the homepage passes live data, and the admin form passes its draft, so the
 * editor previews exactly what visitors see. Nothing is invented here: no photo means no avatar, and a
 * missing title or link simply isn't rendered.
 */
export function FounderCard({ founder, photoSrc }: { founder: FounderPublic; photoSrc?: string | null }) {
  const paragraphs = founder.note.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const photo = photoSrc ?? (founder.photo_url ? buildApiUrl(founder.photo_url) : null);

  return (
    <div className="glass-card relative overflow-hidden px-7 py-9 md:px-12 md:py-12">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: "var(--marketing-accent)" }} aria-hidden />
      <span
        className="pointer-events-none absolute right-8 top-2 select-none font-serif text-[9rem] leading-none text-zinc-900/[0.06]"
        aria-hidden
      >
        &ldquo;
      </span>

      <div className="relative flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`Photo of ${founder.name}`}
            width={112}
            height={112}
            className="h-24 w-24 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-white md:h-28 md:w-28"
          />
        )}

        <div className="min-w-0 flex-1">
          <p
            id="founder-note-heading"
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--marketing-accent-text)" }}
          >
            A note from the founder
          </p>

          <div className="mt-4 max-w-[62ch] space-y-4 text-[15.5px] leading-8 text-zinc-700">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200/80 pt-5">
            <div>
              <p className="font-headline text-[16px] font-bold tracking-tight text-zinc-900">{founder.name}</p>
              {founder.title && <p className="mt-0.5 text-[13px] text-zinc-500">{founder.title}</p>}
            </div>

            {founder.links.length > 0 && (
              <ul className="flex flex-wrap items-center gap-2" aria-label={`${founder.name} on the web`}>
                {founder.links.map((link) => (
                  <li key={link.kind}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${founder.name} on ${link.label} (opens in a new tab)`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        {ICONS[link.kind]}
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The homepage section: renders nothing at all unless the founder has published it. */
export function FounderNote() {
  const { data } = useFounder();
  if (!data?.enabled) return null;

  return (
    <section className="mx-auto max-w-4xl px-6 pb-4 pt-16" aria-labelledby="founder-note-heading">
      <Reveal>
        <FounderCard founder={data} />
      </Reveal>
    </section>
  );
}
