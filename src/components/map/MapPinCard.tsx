'use client';

import { ArrowUpRight, CircleDashed, Heart, Images } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/photographer/Avatar';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { LOCATION_POLICY } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { translatedText } from '@/lib/translation/applies';
import { cn } from '@/lib/utils';

import { precisionParts } from './precision';

/**
 * The card that opens on the map when a pin is chosen.
 *
 * It is the place, not the photograph: the newest frame made there is the face
 * of it, the frames before it are stacked behind, and the whole card links to
 * the place's page where all of them are listed with their photographers. A
 * card per photograph would be a gallery, and FRAME already has one.
 *
 * WHAT THE CARD NOW SHOWS, and why it showed nothing before. The card has
 * always drawn `recentImageUrls[0]`, the place's name, its city and a count —
 * so a place with no published frame drew a grey rectangle with a number under
 * it, which is what the site's owner was looking at. Two things were wrong and
 * both are fixed here: a proposed place never carried the photograph it was
 * proposed with, so approval credited no frame at all (migration 0034), and the
 * card had nothing of the frame itself to show even once one existed. It now
 * carries `pin.latest` — the newest published frame at the place, with its
 * title, its category, its appreciation and whoever made it — so the card
 * answers "what is here and who shot it" before the reader opens anything.
 *
 * A place with no frame yet is still a real place, approved and pinned, so it
 * keeps its card: the cover falls back to an empty plate and the maker's row is
 * simply absent rather than drawn blank.
 *
 * NEWEST FIRST is the rule the stack exists to show. `recentImageUrls` arrives
 * in that order from the query — see `MapPin` — so the frame on top is the most
 * recent one somebody published at this place, and the two edges behind it say
 * that others came before without pretending to show them: at this size a
 * second photograph would be four pixels of a different picture, which reads as
 * a rendering fault rather than as depth. The real count is in the line under
 * the title.
 *
 * `MapPinPreview` is the other card for the same pin, in the panel beside the
 * map on /map. That one is the full `LocationCard` the location index uses, so
 * a place looks like itself wherever it is listed. This one is small, anchored
 * to a point, and sits over a map — so it is its own thing rather than a
 * variant of that, and it carries only what fits.
 */

export function MapPinCard({
  pin,
  onDismiss,
  className,
}: {
  pin: MapPin;
  onDismiss: () => void;
  className?: string;
}) {
  const t = useTranslations('map');
  const locale = useLocale();

  // Two at most behind the top frame: a third edge adds nothing a reader can
  // see and starts to look like a fan of cards.
  const behind = Math.min(Math.max(pin.recentImageUrls.length - 1, 0), 2);
  const cover = pin.recentImageUrls[0] ?? pin.previewImageUrl;
  const latest = pin.latest;

  return (
    <div className={cn('relative w-[17.5rem]', className)}>
      {/* The stacked edges: behind the card and offset downward, so the stack
          reads as paper underneath it. Upward was the first attempt and it put
          two more rows of pixels above a card that is already the tallest thing
          hanging off a pin. */}
      {Array.from({ length: behind }, (_, index) => index + 1).map((layer) => (
        <div
          key={layer}
          aria-hidden
          className="absolute inset-x-0 top-0 h-full rounded-panel border border-line bg-surface"
          style={{
            transform: `translateY(${layer * 5}px) scaleX(${1 - layer * 0.045})`,
            zIndex: -layer,
          }}
        />
      ))}

      <div className="relative overflow-hidden rounded-panel border border-line bg-surface shadow-popover">
        <Link href={`/locations/${pin.slug}`} className="group block">
          <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
            {cover ? (
              <Image
                src={cover}
                alt=""
                fill
                // The card is a fixed 280px wide at every breakpoint, so the
                // browser needs no candidate list to choose from.
                sizes="280px"
                className="object-cover motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-[1.03]"
              />
            ) : null}

            {/* The category of the frame on top, over its own paper so it holds
                against a bright sky or a black wall alike. */}
            {latest ? (
              <CategoryTag
                category={latest.category}
                tone="overlay"
                className="absolute top-2 left-2 backdrop-blur-sm"
              />
            ) : null}
          </div>

          <div className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-caption font-semibold text-balance group-hover:underline">
                {translatedText(pin.name, pin.translations.name, locale)}
              </p>
              <ArrowUpRight
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted group-hover:text-ink"
              />
            </div>

            <p className="mt-0.5 text-meta text-muted">
              {pin.city}, {pin.country}
            </p>

            {/*
              Who made the newest frame here. The whole card already links to
              the place, so this is deliberately not a second link: a link
              inside a link is invalid, and the photographer is reachable in one
              more click from the place's page. The name is the label, so the
              avatar is decorative.
            */}
            {latest?.photographer ? (
              <p className="mt-2.5 flex items-center gap-2 text-meta text-ink-soft">
                <Avatar
                  src={latest.photographer.avatarUrl}
                  name={latest.photographer.displayName}
                  size={20}
                  decorative
                />
                <span className="truncate">
                  {t('pinCard.byline', { name: latest.photographer.displayName })}
                </span>
              </p>
            ) : null}

            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-muted tabular-nums">
              <Images aria-hidden className="size-3.5 shrink-0" />
              <span>{t('pinCard.photographs', { count: pin.photographCount })}</span>
              {latest && latest.appreciationCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <Heart aria-hidden className="size-3.5 shrink-0" />
                  <span>
                    {t('pinCard.appreciations', { count: latest.appreciationCount })}
                  </span>
                </>
              ) : null}
            </p>

            {pin.isApproximate ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-meta leading-relaxed text-muted">
                <CircleDashed aria-hidden className="mt-0.5 size-3 shrink-0" />
                <span>
                  {t('pinPreview.approximate', {
                    precision: t(
                      'precision',
                      precisionParts(LOCATION_POLICY.reducedCoordinateDecimals),
                    ),
                  })}
                </span>
              </p>
            ) : null}
          </div>
        </Link>

        {/*
          A real close button. The card can also be dismissed by clicking the
          map, which is what a pointer user will do — but that gesture does not
          exist for a keyboard, and a card that can only be opened would trap
          the reader in it.
        */}
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'absolute top-2 right-2 grid size-7 place-items-center rounded-pill',
            'border border-line bg-surface/90 text-ink-soft backdrop-blur-sm',
            'hover:border-line-strong hover:text-ink',
          )}
        >
          <span aria-hidden className="text-[0.875rem] leading-none">
            &times;
          </span>
          <span className="sr-only">{t('actions.clearSelection')}</span>
        </button>
      </div>
    </div>
  );
}
