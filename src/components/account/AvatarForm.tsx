'use client';

import { ImageUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { FormStatus } from '@/components/auth/AuthStatus';
import { Avatar } from '@/components/photographer/Avatar';
import { Button } from '@/components/ui/Button';
import { UPLOAD_POLICY } from '@/lib/config';
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
 * canvas at {@link SOURCE_SIZE} and submitted as that. What arrives is a couple
 * of hundred kilobytes of exactly the crop the member was shown.
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
 * Twice the stored size, so the server crops down rather than up and a
 * high-density screen has something to work with if the stored size ever grows.
 */
const SOURCE_SIZE = 512;

/** Good enough that re-encoding to WebP at 82 on the server loses nothing. */
const SOURCE_QUALITY = 0.92;

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
    const canvas = document.createElement('canvas');
    canvas.width = SOURCE_SIZE;
    canvas.height = SOURCE_SIZE;

    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SOURCE_SIZE,
      SOURCE_SIZE,
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
  const [chosen, setChosen] = useState<{ blob: Blob; url: string; name: string } | null>(null);

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
    setChosen({ blob, url: URL.createObjectURL(blob), name: file.name });
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
                  size: formatFileSize(UPLOAD_POLICY.maxAvatarBytes),
                })}
              </span>
            </label>

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
