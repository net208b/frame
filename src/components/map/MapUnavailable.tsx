import { ArrowUpRight, MapPinOff } from 'lucide-react';
import Link from 'next/link';

import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
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
 */

function ListLinkButton() {
  return (
    <Button asChild variant="secondary">
      <Link href="/locations">
        Browse the location list
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

      <CapabilityNotice capability="maps" action="The map" className="max-w-xl text-left" />

      <p className="max-w-md text-caption leading-relaxed text-muted">
        FRAME ships no default tile server on purpose. MapLibre’s demo tiles are licensed for
        evaluation only, so falling back to them would breach those terms on the first page view.
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
  return (
    <ErrorState
      className={className}
      title="The map could not be loaded"
      description={`The style configured in ${MAP_STYLE_ENV_VAR} did not answer, so nothing has been drawn. The places themselves are unaffected. See ${MAP_PROVIDER_DOC} for the provider setup.`}
      action={<ListLinkButton />}
    />
  );
}
