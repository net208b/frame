import { ArrowUpRight, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { MAP_PROVIDER_DOC, MAP_STYLE_ENV_VAR } from './map-style';

/**
 * What a map surface shows when it cannot show a map.
 *
 * Neither state is a blank grey box. A viewer is told what is missing, which
 * variable turns it on, and is handed the route that does the same job without
 * a map: the location list.
 *
 * No heading tag on purpose. Either block can appear inside any page's section,
 * and both carry their own bold title line, so adding a heading here would mean
 * guessing a level and breaking somebody's heading order.
 *
 * No `'use client'` on purpose either, and that is load-bearing now that these
 * blocks read messages: `MapTeaser` renders `MapUnavailable` from the server,
 * while `MapCanvas` and `StaticLocationMap` render it from the client. Keeping
 * the directive off lets Next compile this module into whichever layer imports
 * it, and `useTranslations` from `next-intl` resolves to the matching
 * implementation in both — the server one through the `react-server` export
 * condition, the client one against the provider in the locale layout.
 */

function ListLinkButton() {
  const t = useTranslations('map');

  return (
    <Button asChild variant="secondary">
      <Link href="/locations">
        {t('actions.browseList')}
        <ArrowUpRight aria-hidden className="size-3.5" />
      </Link>
    </Button>
  );
}

/** No map provider is configured, so no map may be drawn at all. */
export function MapUnavailable({
  className,
  heightClassName = 'min-h-[22rem]',
}: {
  className?: string;
  heightClassName?: string;
}) {
  const t = useTranslations('map');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 rounded-panel border border-dashed border-line',
        'bg-surface-sunken px-6 py-12 text-center',
        heightClassName,
        className,
      )}
    >
      <MapPinOff aria-hidden className="size-6 shrink-0 text-muted-soft" />

      {/* CapabilityNotice supplies the other half of this disclosure — which
          variable turns the map on and where the full list is documented — and
          composes its sentences from the `common.capabilityMissing` messages.
          The subject of those sentences is passed in, so it is translated here
          rather than there. */}
      <CapabilityNotice
        capability="maps"
        action={t('unavailable.capabilityAction')}
        className="max-w-xl text-left"
      />

      <p className="max-w-md text-caption leading-relaxed text-muted">
        {t('unavailable.tileServerPolicy')}
      </p>

      <ListLinkButton />
    </div>
  );
}

/**
 * A provider is configured but the style never arrived — a wrong URL, a revoked
 * key, an outage. The places themselves are fine, so say so.
 */
export function MapLoadFailure({ className }: { className?: string }) {
  const t = useTranslations('map');

  return (
    <ErrorState
      className={className}
      title={t('loadFailure.title')}
      description={t('loadFailure.description', {
        variable: MAP_STYLE_ENV_VAR,
        docs: MAP_PROVIDER_DOC,
      })}
      action={<ListLinkButton />}
    />
  );
}
