import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

export async function FeaturedPhotographers({
  photographers,
  locale,
  className,
}: {
  photographers: readonly PhotographerProfile[];
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section className={cn('mt-14', className)}>
      <SectionHead
        eyebrow={t('photographers.eyebrow')}
        title={t('photographers.title')}
        description={t('photographers.description')}
        action={
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
          >
            {t('photographers.all')}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      />

      {photographers.length > 0 ? (
        <ul className="grid gap-4 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">
          {photographers.map((photographer) => (
            <li key={photographer.id}>
              <PhotographerCard photographer={photographer} className="h-full" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t('photographers.emptyTitle')}
          description={t('photographers.emptyDescription')}
        />
      )}
    </section>
  );
}
