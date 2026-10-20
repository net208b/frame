# Roadmap

Feature ideas for FRAME, recorded 19 October 2026, with an assessment of what
the codebase already supports.

This is a planning document, not a commitment. Nothing here is built unless the
"Status" line says so, and a status of **built** was checked against the code,
not assumed from a table existing.

Each idea is kept with the Thai wording it was proposed in, because the Thai is
the original and some of it does not survive translation cleanly.

- [What the binding constraint actually is](#what-the-binding-constraint-actually-is)
- [1. Discovery and the map](#1-discovery-and-the-map)
- [2. Community and critique](#2-community-and-critique)
- [3. Real-world engagement](#3-real-world-engagement)
- [4. Creator portfolio](#4-creator-portfolio)
- [5. Editorial and SEO](#5-editorial-and-seo)
- [6. Photobook](#6-photobook)
- [Suggested order](#suggested-order)
- [Open questions](#open-questions)

---

## What the binding constraint actually is

Worth stating before the feature list, because it changes how to read it.

As of today the production database holds **zero photographs, zero members**.
Every SEO feature below multiplies content that does not exist yet: a city page
with no photographs on it ranks for nothing, and a camera-model page with no
frames taken on that camera is an empty shelf.

So the constraint is content and members, not features. The features that help
most in the near term are the ones that make a *small* amount of content look
considered — and the ones that give the first twenty photographers a reason to
put their work here rather than on Instagram.

That argues for finishing what is nearly done over starting what is new.

---

## 1. Discovery and the map

### 1a. Interactive street map — แผนที่จุดถ่ายรูปสตรีท

> เมื่อคลิกดูปักหมุดในเมืองต่างๆ (เช่น กรุงเทพฯ, โตเกียว, ลอนดอน) จะเห็นพรีวิวภาพถ่ายสตรีทที่เคยถูกบันทึก ณ จุดนั้น

**Status: built and live**, and more than this entry originally asked for.

FRAME draws its own basemap (`src/lib/map/basemap.ts`, served at
`/basemap/{light,dark}-{en,th}`) over OpenFreeMap's tiles — no account, no API
key, no quota, and no running cost. The home page and `/map` open on the
reader's own city, resolved from the request's IP at the edge. A place that has
been photographed is drawn as its newest frame with the earlier ones stacked
behind it, and choosing a pin opens a card anchored beside it. Proposing a new
place is a pin on a map that fills in the city, country and country code for
itself.

**Remaining: nothing on this entry.** The tile provider that this said would be
a running cost turned out not to need paying for — see
`docs/EXTERNAL-SERVICES.md` for what that free basemap costs instead, which is
an SLA rather than money.

### 1b. Spot tips — ข้อมูลสภาวะแสง

> มีข้อมูลย่อยบอกสภาวะแสง เช่น ช่วงเวลาแสงสวยที่สุด (Golden Hour) หรือ บรรยากาศไฟนีออนตอนกลางคืน

**Status: not built.** Needs a new table hanging off `locations`.

One design note worth keeping. `location_restrictions` deliberately requires a
`source` on every row — signage, an operator's policy, a dated site visit —
because a restriction is a factual claim about the world and a wrong one gets a
photographer in trouble. A spot tip is **not** that kind of claim: "the light is
best here around 17:00" is a judgement, and demanding a citation for it would be
theatre. So spot tips should be their own table with their own rules, not an
extra row type in `location_restrictions`.

Golden hour itself is computable from latitude, longitude and date — it does not
need to be stored or crowdsourced at all. Only the subjective part does ("the
neon on this corner is worth the walk after rain").

### 1c. Gear and EXIF explorer — ค้นหาตามอุปกรณ์

> แสดงข้อมูล EXIF (Aperture, Shutter Speed, ISO, Focal Length) ใต้รูปอัตโนมัติ
> คลิกเลือกดูภาพที่ถ่ายด้วย กล้อง/เลนส์เฉพาะรุ่น ได้

**Status: largely built — this is the biggest surprise in the list.**

Already present:

| Piece | Where |
| --- | --- |
| Normalised gear tables | `camera_brands`, `camera_models`, `lens_brands`, `lens_models` |
| Per-photograph settings | `photograph_metadata`: `focal_length_mm`, `aperture`, `shutter_speed`, `iso` |
| Raw EXIF kept for review | `photograph_metadata.exif_source` (jsonb) |
| Free-text fallback | `camera_model_text` etc., so gear outside the curated list is not forced to pretend |
| Facet query | `getGearFacets()` in `src/lib/data/repository.ts` |
| Filtering | `cameraModel` in the Discover query |
| Display | `CaptureSpecs.tsx` on the photograph detail page |

**Remaining — and this is the valuable part:** there is no *landing page per
camera model*. Filtering is a query parameter, which does not rank. The SEO idea
in the proposal — capturing people researching a camera purchase — needs real
URLs like `/gear/ricoh-gr-iii` with their own title, description and canonical.
That is routing and metadata over a query that already exists, which makes it
one of the cheapest high-value items on this list.

A caution on the EXIF display: `exif_source` is kept explicitly as a *review
signal*, and the schema comment says so — every field in EXIF is trivially
editable and it is never proof of ownership. Publishing gear from it is fine.
Treating it as provenance is not.

GPS read from a file is a separate matter again: those columns exist so the
member can be *asked* whether that was the place, and are never published and
never used to move a location. Do not let a gear feature quietly change that.

---

## 2. Community and critique

### 2a. Structured critique mode — โหมดขอคำวิจารณ์เชิงสร้างสรรค์

> ผู้โพสต์กดติ๊กถูกเลือกโหมด "Request Critique"
> คนคอมเมนต์สามารถใส่ Badge ประเมินแยกตามหมวดหมู่ได้ เช่น Composition, Storytelling, Lighting

**Status: not built.** This is the clearest differentiator in the whole list and
also the one with the most design work behind it.

Needs: a flag on `photographs` (opt-in per photograph, not per account), a
`critiques` table, and a per-category rating on each critique. The existing
`reports` and `moderation_actions` tables give the shape to copy for the
moderation side.

The hard part is not the schema. It is that a critique system is a place where
people are unkind to each other, and the reporting and removal path has to exist
on day one rather than being retrofitted. The project already refuses to publish
a moderation action without a reason — the same discipline applies here.

Worth noting: there is currently **no comment system at all**. Critique would be
the first user-to-user text on the platform, which is a much larger step than it
looks from the feature list.

### 2b. Photo series / essays — อัลบั้มเล่าเรื่อง

> รองรับการลงภาพเป็นชุด 3–10 ภาพ เพื่อเล่าเรื่องราวเชิงสารคดี

**Status: partly built.** `collections` and `collection_items` exist, with
`slug`, `visibility` (public/private), a cover photograph, and per-item
ordering. A series is close to a public collection with a narrative.

**Remaining:** a `kind` distinction (a private save-for-later list and a
published photo essay are different things that currently share a table), a body
of text per series, and a minimum/maximum item count if the 3–10 rule is to be
enforced.

---

## 3. Real-world engagement

### 3a. Photo walk events — นัดเดินถ่ายรูป

> สมาชิกในแต่ละเมืองสามารถเปิดตั้งกระทู้นัดเดินถ่ายรูป (Photo Walk) พร้อมระบบกดเข้าร่วม (RSVP)

**Status: not built.** Needs an events table and an RSVP table.

**This is the one feature on the list that deserves genuine caution**, and not
for technical reasons. Every other feature here risks a bad photograph or a
rude comment. This one arranges for strangers to meet at a stated place and
time, which is a different category of risk — and the platform is the thing that
introduced them. Before building it, decide: who may host, whether an attendee
list is public, what happens to a report about something that occurred at a
walk, and what the terms say about the platform's role. Those answers shape the
schema, so they come first.

It is also, for what it is worth, the feature most likely to create real
attachment to the site. The caution is about sequencing, not about dropping it.

### 3b. City ambassadors / curators — ช่างภาพท้องถิ่นคัดเลือกภาพไฮไลท์

> แต่งตั้งช่างภาพท้องถิ่นในแต่ละเมืองใหญ่เป็น Curator

**Status: not built.** `profiles.role` is constrained to
`member | moderator | admin`, so a curator is either a fourth role or — better —
a separate `city_curators` table, since the authority is scoped to one city
rather than being a global privilege level.

One rule from the original brief carries straight over: **no undisclosed
editorial placement.** A curator's picks must be visibly labelled as one
person's selection for that city, with that person named. The existing
Editor's Picks surface already states its basis; curator picks must do the same.

---

## 4. Creator portfolio

### 4a. Exhibition-style profile — หน้าโปรไฟล์สไตล์แกลเลอรี

> URL สั้น เช่น worldofstreetphoto.com/u/username
> ปรับแต่งเลย์เอาต์การวางภาพให้เหมือนนิทรรศการเดี่ยว

**Status: partly built.** Profile pages exist at
`/[locale]/photographers/[username]`.

**Remaining:** two separable pieces.

1. **The short URL.** `/u/username` is a routing addition plus a canonical
   decision — one of the two paths must be canonical and the other must
   redirect, or the same page competes with itself in search. Note the locale
   prefix: today every page sits under `/en` or `/th`, so a bare `/u/name`
   needs a deliberate answer about which language it serves.
2. **Layout customisation.** Larger, and in tension with the design brief —
   the whole visual system is a restrained editorial one, and per-user layout
   control is how that becomes inconsistent. A small set of curated
   arrangements would keep both.

The strategic point behind this one is sound and is the strongest retention
argument in the list: a link a photographer puts in their Instagram bio is a
link they have a reason to keep working.

---

## 5. Editorial and SEO

### 5a. Spotlight city pages — หน้ารวมเมือง

> หน้า URL ที่สร้างขึ้นอัตโนมัติสำหรับเมืองยอดฮิต เช่น /locations/bangkok

**Status: not built, but the data is.** `locations` carries coordinates and
country codes, and photographs reference locations.

**Remaining:** a city-level aggregate. Note that there is currently no `city`
entity — locations have coordinates and a country, so "Bangkok" has to be
derived or introduced. Deriving it from coordinates is doable; introducing a
city table is cleaner and makes the page addressable. That decision is the whole
task.

Pairs naturally with 1c: both are "turn an existing filter into a real URL".

### 5b. Editor's picks and interviews — บทสัมภาษณ์และรีวิว

> บทความสัมภาษณ์ช่างภาพ เบื้องหลังแนวคิด และรีวิวหนังสือภาพถ่าย

**Status: Editor's Picks exists as a photograph surface; written articles do
not.**

Articles do not need a CMS. MDX files in the repository would ship faster, stay
in version control, and cost nothing to run — the tradeoff being that publishing
requires a deploy, which is fine at one article a week and wrong at one a day.
Revisit only if the cadence demands it.

---

## 6. Photobook

Proposed 19 October 2026, after the list above.

> เติมควรเตรียมทำควรมีทำ photobook สำหรับผลงานของ user นั้นๆ อยากให้ photobook ถูกออกแบบด้วย ui รูปแบบ 3d หรือใช้ threejs ออกแบบให้เสมือนจริงเหมือนเปิดหนังสือจริงๆที่สุด

A per-photographer photobook, presented as a real book that opens and turns
pages — built in 3D, Three.js suggested.

**Status: not built.** `three` is not a dependency; this would be the project's
first 3D code. `collections` is the obvious backing store for "which frames, in
what order", so the data side is largely solved already.

This is the most interesting idea on the list and also the most expensive, so
the tradeoffs are worth writing down rather than discovering halfway in.

### What it would cost

- **Bundle.** Three.js is roughly 600 KB minified before any of the project's
  own code. It must be loaded only on the photobook route, dynamically, or every
  page pays for a feature almost nobody opened. The map already sets the
  precedent for route-scoped dynamic loading — see `load-maplibre.ts`.
- **Accessibility.** A book rendered into a `<canvas>` is, to a screen reader, a
  blank rectangle. The project has accessibility as a stated requirement, so a
  3D photobook cannot be the only way to read a photobook. The non-3D version
  has to be the real one, with the 3D as an enhancement over it.
- **Search.** WebGL content is invisible to crawlers. Everything else in section
  5 is about turning content into indexable URLs; a photobook that exists only
  inside a canvas pulls the other way. Same answer as accessibility: real HTML
  underneath, 3D layered on.
- **Low-end phones.** A page-turn simulation with high-resolution photographs on
  both faces is heavy. Needs a device check and a graceful downgrade, not a
  spinner.

### Where it sits against the design brief

Worth being straight about: the brief asks for restraint — editorial
minimalism, hairline borders over heavy shadows, no unnecessary animation. A
skeuomorphic page-turning book is the opposite instinct.

That is not a reason to drop it. It is a reason to **scope it as its own mode**
rather than as the house style: the browsing experience stays quiet and
editorial, and the photobook is a deliberate, separate room you choose to enter
— closer to an exhibition piece than to a UI pattern. Framed that way the two
do not fight.

### The question worth answering first

A photographer who says they want a photobook often wants **a photobook** — a
printed object, or at least a press-ready PDF they can send to a printer or
attach to a submission. A 3D simulation of one on a website is a different
desire: it is presentation, not artefact.

Both are legitimate and they are not the same feature. A PDF/print export is far
cheaper to build, is useful offline, is accessible and indexable by
construction, and is the thing a photographer can actually hold. The 3D version
is the more striking demo.

So: find out which one is wanted, or build the export first and the 3D viewer
on top of the same ordered-collection data. The export does not block the
viewer, and the viewer without the export leaves the more concrete want
unserved.

---

## Suggested order

Ordered by value per unit of work, given that the site currently has no content.

1. **Gear landing pages (1c) and city pages (5a).** Both turn an existing filter
   into an indexable URL. The query, the data and the components already exist;
   what is missing is routing and metadata. Cheapest real SEO on the list.
2. **Photo series (2b).** Collections are most of the way there, and a series is
   what makes a small body of work look deliberate rather than sparse — which is
   exactly the near-term problem.
3. **Short profile URL (4a, part 1).** Small, and it is the link photographers
   will actually share.
4. **Spot tips (1b).** Genuinely useful and genuinely differentiating, and the
   computable half (golden hour) needs no crowdsourcing at all.
5. **Structured critique (2a).** The strongest differentiator, but it is the
   first user-to-user text on the platform and needs its moderation path
   designed before its schema.
6. **City curators (3b).** Cheap once there are enough photographers for a
   selection to mean anything. Pointless before that.
7. **Photo walks (3a).** Highest attachment, highest real-world risk. Build when
   there is a community to walk, and answer the safety questions before the
   schema.
8. **Articles (5b).** Valuable, but it is a writing commitment more than a
   building one. Do not build the pipeline before there are drafts.

The photobook (6) splits across this list rather than sitting at one place:

- **Photobook as a print/PDF export** belongs around position 3. It rides on the
  same ordered collection as photo series (2b), so building it straight after
  series is most of a feature for a fraction of one — and it gives a
  photographer something to hold, which nothing else here does.
- **Photobook as a 3D page-turning viewer** belongs last, after photo walks. It
  is the single most expensive item relative to measurable benefit: a new 600 KB
  dependency, an accessibility and SEO path that has to be built twice, and a
  device-capability problem. Worth doing as a signature piece once there is work
  in it worth presenting that way — and pointless while the site has no
  photographs.

Profile layout customisation (4a, part 2) is deliberately absent: it argues
against the design system, and the short URL delivers most of the benefit.

---

## Open questions

Things that need a decision from the owner before the work above can be scoped.

- **Is "city" an entity?** Needed by 5a and by 3b. Deriving it from coordinates
  avoids a migration; introducing it makes cities addressable and curatable.
  Picking one early avoids building both.
- **Does the platform want user-to-user text at all?** Critique (2a) and photo
  walks (3a) both introduce it, and with it the moderation load the project has
  so far deliberately avoided.
- **What is the platform's stated role in a photo walk?** A terms question, not
  an engineering one, and it gates 3a.
- **Photobook: artefact or presentation?** Does a photographer want a file they
  can print and send, or a striking way to show work on the site? The answer
  decides whether 6 starts as an export or as a Three.js viewer, and the two
  differ by about an order of magnitude in cost. Asking a few photographers is
  cheaper than guessing.
