import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AuthCta, AuthShell, firstParam } from '@/components/auth/AuthShell';
import { ResendVerificationForm } from '@/components/auth/ResendVerificationForm';
import { Notice } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo';

/**
 * Where a confirmation link lands, and where a new one is asked for.
 *
 * /auth/confirm sends every outcome here with a `status`, so a member always
 * reads what happened instead of being dropped on the home page to work it
 * out. The four states below are the only ones honoured; an unrecognised value
 * falls through to the explanation of what a confirmation link is for.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildMetadata({
    title: t('verify.metaTitle'),
    description: t('verify.metaDescription'),
    path: '/verify-email',
    locale,
    noIndex: true,
  });
}

type Status = 'confirmed' | 'email_changed' | 'invalid';

function readStatus(value: string | undefined): Status | null {
  if (value === 'confirmed' || value === 'email_changed' || value === 'invalid') return value;
  return null;
}

/**
 * What each state says, as message keys rather than copy.
 *
 * Keeping the table free of a translator is what lets it stay a plain data
 * structure: the page resolves the keys once, in the language it is rendering.
 */
interface Presentation {
  titleKey: string;
  descriptionKey: string;
  /** The notice above the panel, if this state has something to report. */
  notice: { tone: 'success' | 'danger'; titleKey: string; bodyKey: string } | null;
  /** False once the address is confirmed: there is no link left to resend. */
  offerResend: boolean;
}

function present(status: Status | null): Presentation {
  switch (status) {
    case 'confirmed':
      return {
        titleKey: 'verify.confirmedTitle',
        descriptionKey: 'verify.confirmedDescription',
        notice: {
          tone: 'success',
          titleKey: 'verify.confirmedNoticeTitle',
          bodyKey: 'verify.confirmedNoticeBody',
        },
        offerResend: false,
      };

    case 'email_changed':
      return {
        titleKey: 'verify.confirmedTitle',
        descriptionKey: 'verify.emailChangedDescription',
        notice: {
          tone: 'success',
          titleKey: 'verify.confirmedNoticeTitle',
          bodyKey: 'verify.emailChangedNoticeBody',
        },
        offerResend: false,
      };

    case 'invalid':
      return {
        titleKey: 'verify.invalidTitle',
        descriptionKey: 'verify.invalidDescription',
        notice: {
          tone: 'danger',
          titleKey: 'verify.invalidNoticeTitle',
          bodyKey: 'verify.invalidNoticeBody',
        },
        offerResend: true,
      };

    default:
      return {
        titleKey: 'verify.pendingTitle',
        descriptionKey: 'verify.pendingDescription',
        notice: null,
        offerResend: true,
      };
  }
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });
  const view = present(readStatus(firstParam(resolved.status)));

  return (
    <AuthShell
      eyebrow={t('shell.eyebrow')}
      title={t.rich(view.titleKey, {
        accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
      })}
      description={t(view.descriptionKey)}
      action="Confirming an email address"
      footer={
        view.offerResend ? (
          t.rich('verify.footerResend', {
            signin: (chunks) => (
              <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })
        ) : (
          t.rich('verify.footerDone', {
            privacy: (chunks) => (
              <Link
                href="/legal/privacy"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })
        )
      }
    >
      {view.notice ? (
        <Notice
          tone={view.notice.tone}
          title={t(view.notice.titleKey)}
          className={view.offerResend ? 'mb-6' : undefined}
        >
          {t(view.notice.bodyKey)}
        </Notice>
      ) : null}

      {view.offerResend ? (
        <ResendVerificationForm />
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <AuthCta href="/discover">{t('verify.ctaGallery')}</AuthCta>
          <AuthCta href="/upload" tone="secondary">
            {t('verify.ctaUpload')}
          </AuthCta>
        </div>
      )}
    </AuthShell>
  );
}
