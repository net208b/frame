'use client';

import { ImageUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { FormStatus } from '@/components/auth/AuthStatus';
import { Avatar } from '@/components/photographer/Avatar';
import { Button } from '@/components/ui/Button';
import { UPLOAD_POLICY } from '@/lib/config';
import { AVATAR_VARIANT } from '@/lib/images/variants';
import { cn, formatFileSize } from '@/lib/utils';
import { removeAvatar, updateAvatar } from '@/server/actions/account';

/**
 * The profile picture: choose one, see the square that will be stored, save it.
 *
 * WHY THE BROWSER SHRINKS IT FIRST. The file goes to a server action rather than
 * to storage with a signed grant — an avatar is small enough that one request
 * which ends with the profile updated beats three that leave an orphan object
 * if the member closes the tab. A server action's body is capped, though, and a
 * photograph off a phone is several megabytes, so the picture is drawn into a
 * canvas at {@link SOURCE_SIZE} and submitted as that. What arrives is a few
 * hundred kilobytes of exactly the crop the member was shown.
 *
 * It is a convenience, not the rule. The server decodes whatever arrives, checks
 * it, and re-crops it itself: a browser that cannot do any of this — or a
 * submission made before this script runs — posts the original file and is
 * refused only if it is over the stated limit.
 *
 * THE FIELD IS A DROP ZONE, with the real file input hidden behind the label
 * that draws it — the same arrangement as the upload wizard, so dragging a
 * picture onto it works and a keyboard still lands on a real input. A bare
 * `<input type="file">` does not accept a file dropped anywhere near it, which
 * is the first thing anybody tries.
 *
 * THE PREVIEW IS THE RESULT, not a thumbnail of the chosen file. It is the same
 * centre-cropped square the server will store, drawn at the size the profile
 * will draw it, so "this is what it will look like" is literally true.
 */

/**
 * The widest square this step will send, and a ceiling rather than a target.
 *
 * It tracks the stored size (now 1024) with room above it, because the server
 * resamples down from whatever arrives and handing it a file the same size as
 * its output leaves it nothing to work with. A picture smaller than this is sent
 * at its own size: enlarging here would only hand the server more pixels and no
 * more detail, and the server refuses to enlarge too.
 *
 * A 1536-pixel square at the quality below is 500–700 KB, inside the 2 MB the
 * action accepts.
 */
const SOURCE_SIZE = 1536;

/** High enough that the server's single re-encode is the one that counts. */
const SOURCE_QUALITY = 0.95;

type FormState = Awaited<ReturnType<typeof updateAvatar>> | null;

/**
 * Centre-crop to a square and re-encode, or return null when this browser
 * cannot — in which case the original file is submitted as it is.
 */
async function squareImage(file: File): Promise<Blob | null> {
  try {
    // `from-image` applies the orientation tag, so a portrait photograph off a
    // phone is cropped the right way up rather than on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const side = Math.min(bitmap.width, bitmap.height);
    // Never larger than the square actually available in the picture.
    const target = Math.min(side, SOURCE_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext('2d');
    if (!context) return null;

    // Smoothing at the highest setting the browser offers, because this is one
    // of only two resamples the picture goes through and the other is sharp's.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', SOURCE_QUALITY);
    });
    // A browser that cannot encode WebP returns a PNG instead of null, which the
    // server accepts as readily; only a complete failure falls back to the file.
    return blob;
  } catch {
    return null;
  }
}

/** The square side of a blob this step produced, for the note under the field. */
async function squareSide(blob: Blob): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const side = bitmap.width;
    bitmap.close();
    return side;
  } catch {
    return null;
  }
}

export function AvatarForm({
  name,
  currentUrl,
  disabled = false,
}: {
  /** The member's display name, for the fallback initials. */
  name: string;
  currentUrl: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('account');
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(updateAvatar, null);
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(
    removeAvatar,
    null,
  );

  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [chosen, setChosen] = useState<
    { blob: Blob; url: string; name: string; side: number | null } | null
  >(null);

  // Revoke the object URL when it is replaced or the component goes, so a
  // member who tries five pictures does not leave five of them in memory.
  useEffect(() => {
    return () => {
      if (chosen) URL.revokeObjectURL(chosen.url);
    };
  }, [chosen]);

  /**
   * The choice that is still waiting to be saved.
   *
   * Derived rather than cleared in an effect: a successful save re-renders the
   * page with the new `currentUrl`, and from that moment the local blob is a
   * stale copy of what is already stored. `submitted` remembers *which* choice
   * went to the server, so picking a second picture afterwards is a pending
   * choice again rather than something this comparison swallows.
   */
  const [submitted, setSubmitted] = useState<typeof chosen>(null);
  const settled = saveState?.ok === true && submitted === chosen;
  const pending = settled ? null : chosen;

  const pick = async (file: File | null) => {
    if (!file) {
      setChosen(null);
      return;
    }
    const square = await squareImage(file);
    const blob = square ?? file;
    setChosen({
      blob,
      url: URL.createObjectURL(blob),
      name: file.name,
      side: square ? await squareSide(blob) : null,
    });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    // Intercepted so the resized blob is what travels, rather than the file the
    // input still holds. Without JavaScript the form posts itself and the file
    // goes as it is — see the note at the top.
    if (!pending) return;
    event.preventDefault();
    setSubmitted(pending);

    const data = new FormData();
    // A name with an extension, because the server reads the bytes but a
    // provider and a log are both friendlier with one.
    data.set(
      'avatar',
      pending.blob,
      pending.blob.type === 'image/webp' ? 'avatar.webp' : pending.name,
    );
    saveAction(data);
  };

  const preview = pending?.url ?? currentUrl;

  return (
    <div className="space-y-5">
      <FormStatus state={saveState} />
      <FormStatus state={removeState} />

      <div className="flex flex-wrap items-center gap-6">
        {/* `key` on the URL so a replaced picture is a new element rather than
            the same <img> keeping the old bytes while the new ones decode. */}
        <Avatar key={preview ?? 'none'} src={preview} name={name} size={96} decorative />

        <form
          action={saveAction}
          onSubmit={submit}
          encType="multipart/form-data"
          className="min-w-0 flex-1 space-y-3"
        >
          <fieldset disabled={disabled || saving || removing} className="space-y-3">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              name="avatar"
              accept={UPLOAD_POLICY.acceptedMimeTypes.join(',')}
              onChange={(event) => void pick(event.currentTarget.files?.[0] ?? null)}
              // Visually hidden, not disabled: the label below is the control a
              // pointer uses, and this is the one a keyboard and a screen reader
              // reach. The same arrangement as the upload wizard's drop zone.
              className="peer sr-only"
            />

            <label
              htmlFor={inputId}
              onDragOver={(event: DragEvent<HTMLElement>) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLElement>) => {
                event.preventDefault();
                setDragging(false);
                void pick(event.dataTransfer.files[0] ?? null);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-start rounded-panel border border-dashed px-4 py-5',
                'transition-colors duration-150',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                dragging ? 'border-ink bg-surface' : 'border-line-strong bg-surface hover:border-ink',
              )}
            >
              <span className="flex items-center gap-2 text-caption font-semibold">
                <ImageUp aria-hidden className="size-4 text-muted" />
                {pending ? t('profile.avatarDropReplace') : t('profile.avatarDrop')}
              </span>
              <span className="mt-1.5 text-meta leading-relaxed text-muted">
                {t('profile.avatarHint', {
                  target: AVATAR_VARIANT.size,
                  size: formatFileSize(UPLOAD_POLICY.maxAvatarBytes),
                })}
              </span>
            </label>

            {/*
              Says what will actually be stored. A picture smaller than the
              stored size is kept at its own size rather than enlarged, and a
              member comparing their crisp original against a soft avatar
              deserves to be told that the file they chose was the small one.
            */}
            {pending?.side ? (
              <p className="text-meta leading-relaxed text-muted">
                {pending.side < AVATAR_VARIANT.size
                  ? t('profile.avatarSmall', { side: pending.side, target: AVATAR_VARIANT.size })
                  : t('profile.avatarStored', { side: AVATAR_VARIANT.size })}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
              <Button type="submit" loading={saving} disabled={!pending}>
                {saving ? t('profile.avatarSaving') : t('profile.avatarSubmit')}
              </Button>

              {pending ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChosen(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  {t('profile.avatarCancel')}
                </Button>
              ) : null}
            </div>
          </fieldset>
        </form>
      </div>

      {currentUrl && !pending ? (
        <form action={removeAction}>
          <Button type="submit" variant="ghost" loading={removing} disabled={disabled || saving}>
            {removing ? t('profile.avatarRemoving') : t('profile.avatarRemove')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
