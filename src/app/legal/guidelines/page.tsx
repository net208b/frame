import Link from 'next/link';

import { APPRECIATION_POLICY, LOCATION_POLICY, UPLOAD_POLICY } from '@/lib/config';
import { formatFileSize } from '@/lib/utils';
import { CATEGORY_LABELS, PHOTO_CATEGORIES, REPORT_REASON_LABELS } from '@/types/domain';

import {
  POLICIES,
  POLICY_LINK,
  POLICY_LIST,
  PolicyDocument,
  policyMetadata,
  type PolicySection,
} from '../policy';

export const metadata = policyMetadata(POLICIES.guidelines);

const CATEGORY_SENTENCE = PHOTO_CATEGORIES.map((category) => CATEGORY_LABELS[category]).join(', ');

const SECTIONS: readonly PolicySection[] = [
  {
    id: 'what-belongs',
    heading: 'What belongs on FRAME',
    body: (
      <>
        <p>
          Photographs made in public places, in the six categories the site is built around:{' '}
          {CATEGORY_SENTENCE}. A frame that would sit comfortably in any of those belongs here.
        </p>
        <p>
          Post your own work, once. Write alt text that says what is in the frame rather than what
          it means. Where you know the place, say something useful about standing there: the hour
          the light works, the side of the street to wait on, whether a tripod will get you stopped.
        </p>
        <p>What does not belong:</p>
        <ul className={POLICY_LIST}>
          <li>work you did not make, however freely it was available elsewhere;</li>
          <li>
            generated images presented as photographs — if a frame was made by a model rather than a
            camera, this is not the place for it;
          </li>
          <li>
            composites assembled from several moments and presented as one. Processing a frame is
            photography; building a scene that never existed and captioning it with a street corner
            is not;
          </li>
          <li>
            anything whose point is a person’s humiliation, and anything published to settle a score
            with somebody in it.
          </li>
        </ul>
        <p>
          The technical bounds, for completeness: at most{' '}
          {formatFileSize(UPLOAD_POLICY.maxFileBytes)} per file, at least{' '}
          {UPLOAD_POLICY.minPixelWidth} by {UPLOAD_POLICY.minPixelHeight} pixels, and up to{' '}
          {UPLOAD_POLICY.maxUploadsPerDay} photographs a day.
        </p>
      </>
    ),
  },
  {
    id: 'people',
    heading: 'Consent and dignity when photographing people',
    body: (
      <>
        <p>
          In much of the world it is lawful to photograph people in a public place. Lawful and
          decent are not the same question, and street photography lives in the gap between them.
        </p>
        <p>
          The test worth applying before publishing is simple: would the person recognise themselves
          as the subject of a photograph, or as its target? Do not publish a frame whose only
          content is somebody’s distress, poverty, disability, intoxication, illness or grief. A
          sleeping rough-sleeper is not a composition.
        </p>
        <p>
          Children need more care than adults, not less. Avoid publishing an identifiable child
          without the agreement of whoever is responsible for them.
        </p>
        <p>
          If someone in a photograph asks you to take it down, take it down. You do not have to
          agree that they are right, and you do not have to explain yourself; removing it costs you
          one frame.
        </p>
        <p>
          Several countries require consent for publication regardless of where the photograph was
          taken — France and Germany among them. Publishing is your decision and the law that
          applies to it is yours to know.
        </p>
      </>
    ),
  },
  {
    id: 'places',
    heading: 'Places not to pin',
    body: (
      <>
        <p>
          A pin is an invitation. It tells strangers that something worth photographing is here and
          that they should come and stand in it. Most of the time that is the best thing about the
          site. Sometimes it is the reason not to add one.
        </p>
        <p>Never pin:</p>
        <ul className={POLICY_LIST}>
          <li>
            a private home, including your own if anybody else lives there or next door to it;
          </li>
          <li>
            a shelter, a refuge, a clinic, a school, a place of worship under threat, or anywhere a
            published coordinate increases the risk to the people who use it;
          </li>
          <li>
            a place where standing there is dangerous or unlawful — a rooftop, a tunnel, a live
            railway, a restricted site. Marking it as a photographic location sends somebody else
            there after you.
          </li>
        </ul>
        <p>
          Where a place is genuinely sensitive but worth knowing about, pin the street or the
          district rather than the doorway. Every published coordinate is rounded before anyone sees
          it, and a moderator can coarsen or withhold a point entirely; the{' '}
          <Link href="/legal/privacy" className={POLICY_LINK}>
            privacy notice
          </Link>{' '}
          sets out the precisions involved.
        </p>
      </>
    ),
  },
  {
    id: 'appreciation',
    heading: 'Appreciation is one per member',
    body: (
      <>
        <p>
          Appreciation is a single mark of respect from one member to one photograph. It is not a
          score you can stack, and it cannot be given twice by the same account.
        </p>
        <p>
          So: no second accounts, no arrangements to appreciate each other’s work in bulk, no
          scripts. Both sides of a swap are treated the same way, because both sides knew.
        </p>
        <p>
          This matters more than it might sound. Appreciation feeds the trending order, where recent
          appreciation counts for more than old — the weight halves roughly every{' '}
          {APPRECIATION_POLICY.trendingHalfLifeHours} hours. Manipulating it does not just flatter
          one photograph; it decides what every visitor to the site is shown next.
        </p>
        <p>
          Where manipulation is found the counts are corrected and the accounts involved are
          suspended. Correcting a count is not a punishment, it is an accounting fix: a number on
          this site is supposed to mean what it says.
        </p>
      </>
    ),
  },
  {
    id: 'accuracy',
    heading: 'Location accuracy, and how to report an error',
    body: (
      <>
        <p>
          A place entry is only worth having if it is right. Use the name people actually use for
          it, the city and country it is in, and a coordinate you are confident about rather than
          one you guessed from memory.
        </p>
        <p>
          Submissions are reviewed before they appear. Automated checks look for a coordinate
          outside its stated country, a point within{' '}
          {LOCATION_POLICY.duplicateRadiusMetres} metres of an existing place, suspiciously round
          coordinates and a few other patterns. Those checks produce signals for a moderator to read
          and never a decision — a duplicate flag on two genuinely different doorways is exactly the
          sort of thing a person has to settle.
        </p>
        <p>
          If a published place is wrong, report it with the reason{' '}
          <em>{REPORT_REASON_LABELS['wrong-location']}</em> and say what is wrong in the note: the
          corrected name, the right side of the street, the coordinate that should be there. A
          correction is far more useful than a removal, and much more likely to be acted on quickly.
        </p>
        <p>
          Access notes and restrictions — permits, opening hours, a tripod ban, a fee — are only
          shown when a moderator has recorded where the claim came from. A restriction note nobody
          can source is worse than none at all, because it either sends people away from somewhere
          open or walks them into somewhere closed.
        </p>
      </>
    ),
  },
  {
    id: 'editorial-picks',
    heading: 'Editorial picks are never sold',
    body: (
      <>
        <p>
          An editor’s pick is chosen by a person at FRAME because they think the photograph deserves
          to be seen. It is always labelled as a pick, it is never paid for, and it is never traded
          for anything — not money, not reciprocal promotion, not a favour.
        </p>
        <p>
          There is no promoted placement on FRAME, no paid position in the trending order and no
          sponsored collection. The orderings the galleries offer are described in the interface,
          including what each one actually sorts by, so that nobody has to guess whether a position
          was bought.
        </p>
        <p>
          If that ever changes, the change will be labelled plainly as advertising and announced
          before it happens. A site that shows other people’s work has nothing to sell except
          whether it can be believed.
        </p>
      </>
    ),
  },
];

export default function GuidelinesPage() {
  return (
    <PolicyDocument
      title={POLICIES.guidelines.title}
      summary="FRAME works because photographers treat the people in their frames, the places they pin and each other’s work carefully. These are the expectations that go with holding an account, written as plainly as they can be."
      sections={SECTIONS}
    />
  );
}
