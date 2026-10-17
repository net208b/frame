import { getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SignalBadge, UPLOAD_SIGNAL_MESSAGE_KEYS } from '@/components/moderation/SignalBadge';
import { Avatar } from '@/components/photographer/Avatar';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { formatDate, formatRelative } from '@/lib/utils';
import type { SuspiciousUpload } from '@/types/domain';

/**
 * Uploads held for review.
 *
 * The signals on these rows are the easiest thing in the product to misread. A
 * perceptual hash saying two files look alike is a reason to look; it is not
 * evidence that anyone copied anything, and the same hash fires on two
 * photographs of the same shopfront taken a year apart. So the caveat is
 * printed next to that signal rather than left in a policy document, and the
 * decision that holds an upload is as easy to reach as the one that removes it.
 *
 * That caveat is two sentences and both are translated in full. It is the one
 * piece of copy on this screen that stops a signal being read as a finding, so
 * a Thai moderator gets it at the same size and in the same place as an English
 * one; it is never shortened to fit.
 */

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function optionsFor(t: Translator): readonly DecisionOption[] {
  return [
    {
      value: 'approve',
      label: t('uploads.options.approve.label'),
      effect: t('uploads.options.approve.effect'),
      reasonRequired: false,
      reasonAudience: 'internal',
    },
    {
      value: 'request_changes',
      label: t('uploads.options.hold.label'),
      effect: t('uploads.options.hold.effect'),
      reasonRequired: true,
      reasonAudience: 'internal',
    },
    {
      value: 'remove_content',
      label: t('uploads.options.remove.label'),
      effect: t('uploads.options.remove.effect'),
      reasonRequired: true,
      reasonAudience: 'member',
      destructive: true,
    },
  ];
}

export async function SuspiciousUploadQueue({
  locale,
  uploads,
}: {
  locale: Locale;
  uploads: readonly SuspiciousUpload[];
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <section aria-labelledby="queue-uploads">
      <SectionHead
        eyebrow={t('uploads.eyebrow')}
        title={<span id="queue-uploads">{t('uploads.title')}</span>}
        description={t('uploads.description')}
      />

      <QueueCapNote locale={locale} shown={uploads.length} />

      {uploads.length === 0 ? (
        <EmptyState
          title={t('uploads.emptyTitle')}
          description={t('uploads.emptyDescription')}
        />
      ) : (
        <ul className="border-t border-line">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} locale={locale} upload={upload} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function UploadRow({ locale, upload }: { locale: Locale; upload: SuspiciousUpload }) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const intlLocale = INTL_LOCALES[locale];

  const uploadedOn = formatDate(upload.createdAt, intlLocale);
  const hasHashMatch = upload.signals.some((signal) => signal.kind === 'perceptual-hash-match');

  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="flex min-w-0 gap-5">
          <Image
            src={upload.thumbUrl}
            // SuspiciousUpload carries no alt text, so this names what the
            // image is rather than claiming to describe what is in it.
            alt={t('uploads.thumbAlt', { title: upload.title })}
            width={160}
            height={160}
            sizes="160px"
            className="size-20 shrink-0 rounded-media border border-line object-cover sm:size-[120px]"
          />

          <div className="min-w-0">
            <h3 className="text-title font-bold">{upload.title}</h3>

            <p className="mt-1 text-meta text-muted">
              {t.rich('uploads.uploadedAt', {
                when: formatRelative(upload.createdAt, new Date(), intlLocale),
                time: (chunks) => (
                  <time dateTime={upload.createdAt} title={uploadedOn ?? undefined}>
                    {chunks}
                  </time>
                ),
              })}
              {` · ${t('uploads.notPublishedYet')}`}
            </p>

            <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-muted">
              <Avatar
                src={upload.uploader.avatarUrl}
                name={upload.uploader.displayName}
                size={24}
                decorative
              />
              <span>
                {t.rich('uploads.uploadedBy', {
                  name: upload.uploader.displayName,
                  link: (chunks) => (
                    <Link
                      href={`/photographers/${upload.uploader.username}`}
                      className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </p>

            {upload.signals.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {upload.signals.map((signal, index) => (
                  <SignalBadge
                    // Derived in the repository rather than stored, so there is
                    // no id; the kind plus its position is the stable key.
                    key={`${signal.kind}-${index}`}
                    locale={locale}
                    severity={signal.severity}
                    label={t(UPLOAD_SIGNAL_MESSAGE_KEYS[signal.kind])}
                    message={signal.message}
                  >
                    {signal.relatedLabel ? (
                      <span className="text-meta text-muted">{signal.relatedLabel}</span>
                    ) : null}
                  </SignalBadge>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-meta text-muted">{t('uploads.noSignals')}</p>
            )}

            {hasHashMatch ? (
              <p className="mt-3 rounded-card bg-warning-bg px-3.5 py-2.5 text-meta leading-relaxed text-warning">
                <span className="font-bold">{t('uploads.hashCaveatHeadline')}</span>{' '}
                <span className="text-ink-soft">{t('uploads.hashCaveatBody')}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'upload', photographId: upload.photographId }}
            subjectLabel={t('uploads.subject', {
              title: upload.title,
              name: upload.uploader.displayName,
            })}
            options={optionsFor(t)}
          />
        </div>
      </div>
    </li>
  );
}
