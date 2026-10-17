import Link from 'next/link';

import {
  POLICIES,
  POLICY_LINK,
  POLICY_LIST,
  PolicyDocument,
  policyMetadata,
  type PolicySection,
} from '../policy';

export const metadata = policyMetadata(POLICIES.copyright);

const SECTIONS: readonly PolicySection[] = [
  {
    id: 'ownership',
    heading: 'The photographer keeps the copyright',
    body: (
      <>
        <p>
          Uploading a photograph to FRAME transfers nothing. You made it, you own it, and you can
          license it to whoever you like on whatever terms you like, including terms FRAME knows
          nothing about.
        </p>
        <p>
          Every photograph is shown with its photographer’s name and a link to their profile, and
          the footer of every page says that FRAME licenses nothing on anyone’s behalf. That is not
          decoration: it is the whole arrangement.
        </p>
      </>
    ),
  },
  {
    id: 'licence',
    heading: 'The licence you grant FRAME',
    body: (
      <>
        <p>
          Publishing a photograph grants FRAME a non-exclusive, worldwide, royalty-free licence, for
          as long as the photograph is on FRAME, to do four things and no more:
        </p>
        <ul className={POLICY_LIST}>
          <li>store the file you uploaded;</li>
          <li>
            generate the smaller sizes needed to show it without sending a full-resolution original
            to every visitor;
          </li>
          <li>
            display it on FRAME’s own pages — the galleries, the map, a location page, a profile, a
            collection — with your credit;
          </li>
          <li>
            feature it in FRAME’s own editorial promotion of FRAME, such as an editor’s pick or a
            post about a photograph that is on the site, again with your credit.
          </li>
        </ul>
        <p>
          That licence does not include sublicensing your work to a third party, selling it,
          offering it as stock, printing it for sale, using it in paid advertising, or using it to
          train a machine-learning model. None of those are covered, and none of them will be added
          by amending this page quietly.
        </p>
        <p>
          Removing the photograph ends the licence. Already-generated sizes are deleted with it;
          anything already printed on paper obviously cannot be recalled, which is why the
          promotional use above is deliberately narrow.
        </p>
      </>
    ),
  },
  {
    id: 'commercial-use',
    heading: 'Commercial and advertising use needs separate permission',
    body: (
      <>
        <p>
          Any use beyond the four above is a separate agreement between you and whoever wants it.
          That includes advertising, merchandise, editorial use by a publication, print sales and
          licensing to a brand, whether the request reaches you through FRAME or not.
        </p>
        <p>
          Where someone contacts FRAME wanting to license a photograph, they are given the
          photographer’s profile and nothing else. FRAME does not negotiate on your behalf, does not
          take a cut, and does not pass on your email address without asking you first.
        </p>
      </>
    ),
  },
  {
    id: 'takedown',
    heading: 'Reporting an infringement',
    body: (
      <>
        <p>
          If a photograph on FRAME is yours and was published by somebody else, report it with the
          reason{' '}
          <em>
            This photograph is not the uploader’s work
          </em>{' '}
          or <em>Copyright infringement</em>, and include the following. A complaint missing any of
          it cannot be acted on, and will be returned saying which part is missing.
        </p>
        <ul className={POLICY_LIST}>
          <li>The address of the photograph on FRAME.</li>
          <li>
            Identification of the work you say it infringes: a link to where you published it, or a
            copy, or enough description to identify it unambiguously.
          </li>
          <li>Your relationship to that work — the photographer, the rights holder, or an agent.</li>
          <li>Your name and an address we can reply to.</li>
          <li>
            A statement that you believe in good faith that the use on FRAME is not authorised.
          </li>
          <li>A statement that what you have said is accurate.</li>
        </ul>
        <p>What happens next, and roughly when:</p>
        <ul className={POLICY_LIST}>
          <li>
            <strong className="font-semibold text-ink">Within two working days</strong> the
            complaint is acknowledged and read by a moderator.
          </li>
          <li>
            <strong className="font-semibold text-ink">Where the claim is on its face valid</strong>
            , the photograph is hidden while it is examined. Hiding it is a precaution, not a
            finding: it means nobody is harmed further while the question is open.
          </li>
          <li>
            <strong className="font-semibold text-ink">Within five working days</strong> the
            uploader is told what has been claimed, and by whom to the extent they need in order to
            answer it. They have ten working days to respond.
          </li>
          <li>
            <strong className="font-semibold text-ink">A decision is recorded with a reason</strong>{' '}
            and both sides are told what it was. If the claim is upheld the photograph stays down.
            If it is not, the photograph comes back and the report is closed as dismissed.
          </li>
        </ul>
        <p>
          Those timings are the intent of a project with a small moderation team, not a contractual
          guarantee, and they will be revised here if they turn out to be unrealistic rather than
          quietly missed.
        </p>
      </>
    ),
  },
  {
    id: 'counter-notice',
    heading: 'If your photograph was removed and the claim was wrong',
    body: (
      <>
        <p>
          You can answer a claim. A counter-notice needs the address of the photograph, an
          explanation of why you have the right to publish it, your name and a contact address, and
          a statement that what you have said is accurate.
        </p>
        <p>
          Where the answer is credible the photograph is restored and the complainant is told, so
          that they can take the matter further through a court if they still believe they are
          right. FRAME is not in a position to decide who owns a photograph: where two accounts both
          claim the same work and neither will move, the photograph stays down until they settle it
          between themselves or somebody with the authority to decide does.
        </p>
        <p>
          Filing a claim or a counter-notice you know to be false is grounds for closing the
          account, and in several jurisdictions is an offence in its own right.
        </p>
      </>
    ),
  },
  {
    id: 'repeat-infringement',
    heading: 'Repeat infringement',
    body: (
      <>
        <p>Upheld claims are counted against the account they were upheld against.</p>
        <ul className={POLICY_LIST}>
          <li>A first upheld claim: the photograph is removed and the member is told why.</li>
          <li>
            A second: uploading is suspended while the account is reviewed, and every other
            photograph on it is checked.
          </li>
          <li>A third: the account is closed.</li>
        </ul>
        <p>
          Claims that were withdrawn, dismissed or answered successfully are not counted. Deleting a
          photograph and uploading it again does not reset the count, and neither does opening a
          second account — an account opened to continue after a closure is closed as well.
        </p>
      </>
    ),
  },
  {
    id: 'similarity-matching',
    heading: 'A similarity match is a signal, never a finding',
    body: (
      <>
        <p>
          FRAME computes a perceptual fingerprint of each upload and shows a moderator when a new
          photograph closely resembles one already on the site. That check is useful and it is also
          close to blind: it cannot tell which of two uploads was made first, cannot tell a crop
          from a copy, and cannot tell a photographer re-uploading their own work from somebody
          taking it.
        </p>
        <p>
          So it never removes anything by itself. It puts a pair in front of a person, who then has
          to do the actual work of establishing who made the photograph. The same is true of the
          other automated signals: a file with no EXIF is not evidence of theft, because exporting
          software strips EXIF as a matter of routine, and a burst of uploads is not evidence of
          anything except enthusiasm.
        </p>
        <p>
          Those signals are shown in the moderation queue labelled as signals, with their severity,
          precisely so that nobody mistakes one for a conclusion. The{' '}
          <Link href="/legal/guidelines" className={POLICY_LINK}>
            community guidelines
          </Link>{' '}
          describe the rest of what moderators look at.
        </p>
      </>
    ),
  },
];

export default function CopyrightPage() {
  return (
    <PolicyDocument
      title={POLICIES.copyright.title}
      summary="You keep the copyright in everything you publish here. FRAME takes only the narrow licence it needs to show your work on FRAME, and this page sets out how a claim that somebody has published work that is not theirs is handled."
      sections={SECTIONS}
    />
  );
}
