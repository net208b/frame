import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/** The 404 a series address falls back to — deleted and never-existed read the same. */
export default function SeriesNotFound() {
  const t = useTranslations('series');

  return (
    <div className="site-container py-24">
      <Eyebrow>{t('eyebrow')}</Eyebrow>
      <h1 className="mt-4 max-w-[20ch] text-display-fluid">{t('notFound.heading')}</h1>
      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-muted">{t('notFound.body')}</p>
      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/discover">{t('notFound.discover')}</Link>
        </Button>
      </div>
    </div>
  );
}
