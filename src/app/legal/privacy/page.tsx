import Link from 'next/link';

import { LOCATION_POLICY } from '@/lib/config';
import { precisionLabel } from '@/lib/geo';

import {
  POLICIES,
  POLICY_LINK,
  POLICY_LIST,
  PolicyDocument,
  policyMetadata,
  type PolicySection,
} from '../policy';

export const metadata = policyMetadata(POLICIES.privacy);

const PUBLIC_PRECISION = precisionLabel(LOCATION_POLICY.publicCoordinateDecimals);
const REDUCED_PRECISION = precisionLabel(LOCATION_POLICY.reducedCoordinateDecimals);

const SECTIONS: readonly PolicySection[] = [
  {
    id: 'what-is-collected',
    heading: 'What is collected',
    body: (
      <>
        <p>Only what the site needs in order to work:</p>
        <ul className={POLICY_LIST}>
          <li>
            <strong className="font-semibold text-ink">An email address</strong>, so an account can
            be recovered and verified. The password itself is never stored; the authentication
            provider holds a hash of it and FRAME never sees the original.
          </li>
          <li>
            <strong className="font-semibold text-ink">The profile fields you write</strong>:
            username, display name, avatar, biography, where you are based, a website, and the gear
            you choose to list. Every one of them is free text you decide to enter, and every one of
            them is optional except the username and display name.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              The photographs you upload and the EXIF inside them
            </strong>
            : camera and lens, focal length, aperture, shutter speed, ISO, the capture date and,
            where the camera recorded one, a GPS coordinate.
          </li>
          <li>
            <strong className="font-semibold text-ink">Appreciation records</strong>: which account
            appreciated which photograph. Appreciation is one per member, and that cannot be
            enforced without keeping the record of who it was.
          </li>
          <li>
            <strong className="font-semibold text-ink">Reports</strong>: the thing reported, the
            reason chosen, any note written, and the reporting account where the reporter was signed
            in.
          </li>
          <li>
            <strong className="font-semibold text-ink">Place submissions</strong>: the name, city,
            country, coordinate and note proposed for a new location.
          </li>
          <li>
            <strong className="font-semibold text-ink">Rate-limit counters</strong>, keyed to the
            account taking the action.
          </li>
        </ul>
        <p>
          Not collected: an advertising identifier, a behavioural profile, cross-site tracking, or a
          record of what anyone searches for. FRAME has no analytics vendor embedded in it.
        </p>
      </>
    ),
  },
  {
    id: 'what-is-published',
    heading: 'What is published, and what is not',
    body: (
      <>
        <p>
          <strong className="font-semibold text-ink">Published</strong>, meaning visible to anyone
          including people with no account: your display name, username and avatar; your biography,
          based-in line, website and listed gear; the month you joined; the photographs you have
          published, with their titles, alt text, descriptions, categories and capture settings; the
          places you submitted that were approved; your public collections; and the appreciation
          count on each photograph.
        </p>
        <p>
          <strong className="font-semibold text-ink">Not published</strong>: your email address; the
          exact day you joined, which is why a profile shows a month only; your drafts and anything
          still processing; your private collections; which photographs you appreciated, as distinct
          from the totals; the reports you filed and the fact that you filed them; and your
          rate-limit counters.
        </p>
        <p>
          A photograph you remove, or that a moderator removes, stops being served immediately.
          Caches and other people’s browsers may hold a copy for a short while afterwards, which is
          a property of the web rather than a decision FRAME makes.
        </p>
      </>
    ),
  },
  {
    id: 'exif-and-place',
    heading: 'EXIF, and the place a photograph was made',
    body: (
      <>
        <p>
          EXIF is read in your browser as you choose a file, so the upload form can offer the camera
          and the settings back to you instead of asking you to type them. You can change or clear
          any of it before publishing.
        </p>
        <p>
          <strong className="font-semibold text-ink">
            A GPS coordinate found in EXIF is never published automatically.
          </strong>{' '}
          It is used for one purpose: to ask whether you want to pin the photograph to a place. If
          you do not answer, nothing is pinned. A coordinate that stays in the file you uploaded is
          not served to anyone, because what FRAME serves are generated derivatives with the
          metadata stripped out.
        </p>
        <p>
          Where you do publish a place, the coordinate is rounded by policy to{' '}
          {PUBLIC_PRECISION} — enough to find a doorway, not enough to point at a window. Where a
          moderator has marked a place as privacy-sensitive it is coarsened further, to{' '}
          {REDUCED_PRECISION}, and where even that would be unsafe no coordinate is published at
          all. The map and the page both say when a point is deliberately approximate.
        </p>
        <p>
          Precision is only ever reduced, never widened: a coarsened point stays coarsened, and
          there is no stored copy of the finer value that a later change could expose. If you
          published a place and now regret it, ask and it will be coarsened or removed.
        </p>
      </>
    ),
  },
  {
    id: 'ip-addresses',
    heading: 'Why an IP address is not treated as identity',
    body: (
      <>
        <p>
          An IP address identifies a connection at a moment, not a person. It is shared by everyone
          in a household, an office, a university or a café, it is shared at much larger scale by
          mobile carriers, and it changes — sometimes several times a day.
        </p>
        <p>
          So FRAME keys its limits and its records to an account rather than to an address. Treating
          an address as a person gets it wrong in both directions: a crowded café is throttled as
          though it were one very busy member, while somebody determined to abuse the site only has
          to reconnect.
        </p>
        <p>
          The exceptions are the requests that arrive before a session exists — signing up, signing
          in, asking for a password reset — where the limit can only be applied to the attempt
          itself. Those counters are short-lived and are not used to build a profile.
        </p>
        <p>
          A hosting provider records the IP address of every request as part of serving it. That is
          true of any website. FRAME does not read those logs to identify a member, does not join
          them to account records, and does not use them for anything other than keeping the service
          running.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    heading: 'How long things are kept',
    body: (
      <>
        <ul className={POLICY_LIST}>
          <li>Account and profile: for as long as the account exists.</li>
          <li>
            Published photographs and their generated sizes: until you remove them, or until the
            account is deleted.
          </li>
          <li>
            Drafts: until you publish or discard them. A draft that is never finished is still
            yours.
          </li>
          <li>Appreciation records: while both the account and the photograph exist.</li>
          <li>
            Reports and moderation decisions: kept after the thing they concerned has gone, because
            the reason something was removed is the only answer to the same claim arriving twice.
            They are attached to the moderator who decided, not to the person who reported.
          </li>
          <li>Rate-limit counters: hours, not months. They are cleaned up as they expire.</li>
        </ul>
        <p>
          Backups will hold a copy of deleted content for a period after deletion. A specific
          retention window for backups has to be set, and stated here, before launch.
        </p>
      </>
    ),
  },
  {
    id: 'access-and-deletion',
    heading: 'Access, correction and deletion',
    body: (
      <>
        <p>
          Most of this you can do yourself, which is the point: edit any profile field, remove a
          photograph, make a collection private, or delete the account outright.
        </p>
        <p>
          Deleting an account removes the profile, the photographs, the generated sizes and the
          collections. Two things survive it. Moderation decisions are kept with the account
          reference removed wherever that is possible, for the reason above. And where the account
          belonged to a moderator, the audit trail it authored cannot be left without an author, so
          such an account is demoted and retained rather than erased — a point worth knowing before
          anybody is made a moderator.
        </p>
        <p>
          You can ask for a copy of what is held about you, and for a correction of anything that is
          wrong. The contact route for those requests, and the supervisory authority a complaint can
          be taken to, must be named here before launch.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    heading: 'Who else handles this',
    body: (
      <>
        <p>FRAME is a small application standing on four services:</p>
        <ul className={POLICY_LIST}>
          <li>
            <strong className="font-semibold text-ink">The database and authentication
            provider</strong>{' '}
            (Supabase, Postgres and its auth service) holds accounts, profiles, photographs,
            appreciation, reports and the email address and password hash.
          </li>
          <li>
            <strong className="font-semibold text-ink">The image storage provider</strong> (Supabase
            Storage, or Cloudflare R2 where that is configured instead) holds the uploaded file and
            the sizes generated from it.
          </li>
          <li>
            <strong className="font-semibold text-ink">The map tile provider</strong> supplies the
            style and tiles for the map. Your browser requests those tiles directly, so that
            provider sees the request, including your IP address, the way any website you visit
            does. FRAME ships with no tile provider configured and deliberately falls back to no map
            rather than to somebody’s evaluation server.
          </li>
          <li>
            <strong className="font-semibold text-ink">The hosting provider</strong> runs the
            application and logs requests as described above.
          </li>
        </ul>
        <p>
          A deployment with no database configured shows a bundled sample dataset instead, and says
          so on every page. The sample photographs in that mode are served from Unsplash under the
          Unsplash licence and describe nobody real.
        </p>
        <p>
          Each of those providers needs to be named specifically, with a data-processing agreement
          in place, before FRAME handles anybody’s real data. See{' '}
          <Link href="/legal/terms" className={POLICY_LINK}>
            the terms
          </Link>{' '}
          for what is still outstanding.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <PolicyDocument
      title={POLICIES.privacy.title}
      summary="FRAME collects an email address, whatever you choose to write on your profile, the photographs you upload, and the records needed to keep appreciation and moderation honest. It publishes far less than it holds, and it never publishes a coordinate you did not choose to publish."
      sections={SECTIONS}
    />
  );
}
