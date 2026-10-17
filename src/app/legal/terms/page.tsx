import Link from 'next/link';

import { UPLOAD_POLICY } from '@/lib/config';
import { formatFileSize } from '@/lib/utils';

import {
  POLICIES,
  POLICY_LINK,
  POLICY_LIST,
  PolicyDocument,
  policyMetadata,
  type PolicySection,
} from '../policy';

export const metadata = policyMetadata(POLICIES.terms);

const SECTIONS: readonly PolicySection[] = [
  {
    id: 'eligibility',
    heading: 'Who may use FRAME',
    body: (
      <>
        <p>
          Anyone may read FRAME. Browsing photographs, places and profiles needs no account and no
          sign-in.
        </p>
        <p>
          An account is for people aged 16 or over, or the local minimum age for consenting to
          online services where that is higher. One account per person. An account is personal, is
          not transferable, and the password on it is yours to keep to yourself.
        </p>
        <p>
          FRAME may decline to create an account, and may close one, for the reasons set out under
          suspension below.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    body: (
      <>
        <p>
          FRAME is a community archive of street photography. Use it for that. In particular, do
          not:
        </p>
        <ul className={POLICY_LIST}>
          <li>
            publish a photograph you did not make, or that you do not have the rights and
            permissions to publish;
          </li>
          <li>
            publish anything unlawful, anything that harasses or endangers a person, or anything
            that sexualises a child;
          </li>
          <li>
            pin a photograph to a private home or to a place where a published coordinate puts
            somebody at risk, which the{' '}
            <Link href="/legal/guidelines" className={POLICY_LINK}>
              community guidelines
            </Link>{' '}
            set out in detail;
          </li>
          <li>
            inflate appreciation with second accounts, reciprocal arrangements or automation, or
            interfere with the ordering of what other people see;
          </li>
          <li>
            scrape the site, work around a rate limit, or try to reach another member’s drafts,
            private collections, email address or reports;
          </li>
          <li>file reports you do not believe, which wastes the time a real one needs.</li>
        </ul>
        <p>
          Uploads are also bounded technically: at most{' '}
          {formatFileSize(UPLOAD_POLICY.maxFileBytes)} per file, at least{' '}
          {UPLOAD_POLICY.minPixelWidth} by {UPLOAD_POLICY.minPixelHeight} pixels, JPEG, PNG, WebP or
          AVIF, and up to {UPLOAD_POLICY.maxUploadsPerDay} photographs a day. Those limits exist to
          keep one account from running up everybody’s costs, not to judge your work.
        </p>
      </>
    ),
  },
  {
    id: 'your-work',
    heading: 'Your work, and your responsibility for it',
    body: (
      <>
        <p>
          You keep the copyright in every photograph you upload. What uploading grants FRAME, and
          what it does not, is set out in the{' '}
          <Link href="/legal/copyright" className={POLICY_LINK}>
            copyright notice
          </Link>
          .
        </p>
        <p>By publishing a photograph on FRAME you confirm three things:</p>
        <ul className={POLICY_LIST}>
          <li>you made it;</li>
          <li>
            you have whatever permission the law where you were standing requires from a
            recognisable person in the frame, or from the owner of a private property;
          </li>
          <li>publishing it breaks no contract, court order or embargo you are subject to.</li>
        </ul>
        <p>
          FRAME reads the EXIF in a file to fill in the camera, the lens and the settings for you.
          That is a convenience and nothing more: EXIF says which camera produced a file, not who
          holds the copyright in the photograph, and FRAME does not treat it as evidence of
          ownership either way. A file with no EXIF at all is published on the same terms.
        </p>
        <p>
          Alt text is required on every photograph because a published image without it is not
          published to everybody. Write what is in the frame.
        </p>
        <p>
          You remain responsible for what you publish. FRAME is the venue, not the author, and a
          claim about a photograph is answered by the person who uploaded it.
        </p>
      </>
    ),
  },
  {
    id: 'suspension',
    heading: 'Suspension and termination',
    body: (
      <>
        <p>
          You can delete your account whenever you like. What that removes, and what survives it, is
          described in the{' '}
          <Link href="/legal/privacy" className={POLICY_LINK}>
            privacy notice
          </Link>
          .
        </p>
        <p>FRAME may suspend an account where there is:</p>
        <ul className={POLICY_LIST}>
          <li>a credible claim that a photograph on it is not the uploader’s work;</li>
          <li>repeated disregard of the community guidelines after being told;</li>
          <li>manipulation of appreciation or of the ordering of the galleries;</li>
          <li>harassment of another member, or of a person in a photograph.</li>
        </ul>
        <p>
          A suspension is recorded with a reason and the reason is shown to the account it concerns.
          A suspended account can still read FRAME but cannot publish, appreciate, submit a place or
          change a collection. Suspension is not deletion: the work is hidden, not destroyed, while
          the matter is settled.
        </p>
        <p>
          Every one of those decisions is made by a person and can be revisited by a person. If a
          decision about your account was wrong, say so and it will be looked at again.
        </p>
        <p>
          The record of a moderation decision is kept even after the photograph or the account it
          concerned has gone, because a record of why something was removed is what stops the same
          dispute reopening from the beginning.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    heading: 'Limitation of liability',
    body: (
      <>
        <p>
          FRAME is provided as it is. While the project is in development it may be unavailable
          without notice, may lose data, and may change in ways that are not backwards compatible.
          Keep your own copies of your photographs.
        </p>
        <p>
          The shooting notes, access notes and restrictions attached to a place are written by
          members and checked by moderators against a recorded source. They are not a guarantee.
          Whether a place is safe to stand in, open to the public, or legal to photograph is for you
          to establish locally before you go, and it can change between the note being written and
          your arriving.
        </p>
        <p>
          To the extent the law allows, FRAME is not liable for indirect or consequential loss
          arising from use of the site, including lost work, lost income or a journey made on the
          strength of a location note. Nothing here limits liability that cannot lawfully be
          limited, including liability for death or personal injury caused by negligence, or for
          fraud.
        </p>
        <p>
          The operating entity, the governing law and the forum for a dispute are not yet settled
          and must be named here before FRAME is launched. Until then this document describes
          intent, not an enforceable agreement.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes to these terms',
    body: (
      <>
        <p>
          These terms will change as the product does, and the date at the top of this page records
          when they were last read through.
        </p>
        <p>
          A change that materially affects what members may do, or what FRAME may do with their
          work, will be announced in the interface before it takes effect rather than quietly
          published. Continuing to use FRAME after that notice means accepting the change; if you
          would rather not, you can remove your work and close your account.
        </p>
        <p>
          The current version always lives at this address. There is no separate paper copy that
          says something different.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <PolicyDocument
      title={POLICIES.terms.title}
      summary="These terms cover who may hold an account, what may be published, what happens when something is published that should not have been, and the limits of what FRAME promises while it is still being built."
      sections={SECTIONS}
    />
  );
}
