#!/usr/bin/env node
/**
 * Schema round-trip check.
 *
 *   node --experimental-strip-types db/check-schema.ts
 *
 * `campaignDraftSchema` is imported by both the browser form and the API route, and the form submits
 * the schema's *output* — normalised, trimmed, `website: null` when blank. So the input type has to
 * accept its own output; if it does not, the client sends a payload the server rejects with a message
 * no user can act on. That failure is invisible until someone submits the form with an optional
 * field left empty, which is exactly the case that had shipped broken once already.
 *
 * There is no test runner in this project, so this is a plain script that exits non-zero on failure
 * and can be wired into CI in one line. Deliberately dependency-free.
 */

import {
  campaignDraftSchema,
  MAX_VIDEO_BYTES,
  type CampaignDraft,
} from '../lib/validation/campaign.ts';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  pass  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const VALID: Record<string, unknown> = {
  brandName: '  Aurora Coffee  ',
  contactName: 'Ada Okafor',
  email: '  Ada@Example.COM ',
  phone: '+44 20 7946 0001',
  website: 'aurora.coffee',
  campaignName: 'Cold brew hero',
  campaignDescription: '  30s hero film.  ',
  video: { fileName: 'hero.mp4', mimeType: 'video/mp4', bytes: 1024 },
};

console.log('\nschema round-trip\n');

// 1. The happy path validates and normalises.
const first = campaignDraftSchema.safeParse(VALID);
check('valid payload parses', first.success, first.success ? '' : JSON.stringify(first.error.issues));
const normalised = first.success ? (first.data as CampaignDraft) : null;

// 2. The output re-validates. This is the property that matters.
if (normalised) {
  const second = campaignDraftSchema.safeParse(normalised);
  check(
    'output of parse() is itself valid input',
    second.success,
    second.success ? '' : JSON.stringify(second.error.issues),
  );
  check(
    'parse() is idempotent',
    second.success && JSON.stringify(second.data) === JSON.stringify(normalised),
  );
}

// 3. Optional fields may be absent, empty, or explicitly null — all three reach the API.
for (const [label, website] of [
  ['absent', undefined],
  ['empty string', ''],
  ['null', null],
] as const) {
  const payload: Record<string, unknown> = { ...VALID };
  if (website === undefined) delete payload.website;
  else payload.website = website;

  const parsed = campaignDraftSchema.safeParse(payload);
  check(`website ${label} is accepted`, parsed.success, parsed.success ? '' : parsed.error.issues[0]?.message);
  check(
    `website ${label} normalises to null`,
    parsed.success && parsed.data.website === null,
  );
}

// 4. The same for the video block.
for (const [label, video] of [
  ['absent', undefined],
  ['null', null],
] as const) {
  const payload: Record<string, unknown> = { ...VALID };
  if (video === undefined) delete payload.video;
  else payload.video = video;

  const parsed = campaignDraftSchema.safeParse(payload);
  check(`video ${label} is accepted`, parsed.success, parsed.success ? '' : parsed.error.issues[0]?.message);
}

// 5. Normalisation actually happens.
check(
  'email is lowercased',
  normalised?.email === 'ada@example.com',
  normalised?.email,
);
check(
  'bare host gains a scheme',
  normalised?.website === 'https://aurora.coffee',
  normalised?.website ?? 'null',
);
check(
  'text is trimmed',
  normalised?.brandName === 'Aurora Coffee' && normalised?.campaignDescription === '30s hero film.',
);

// 6. The fields the server must never accept.
const REJECTED: [string, Record<string, unknown>][] = [
  ['one-character brand name', { brandName: 'A' }],
  ['non-http website scheme', { website: 'javascript:alert(1)' }],
  ['email with no @', { email: 'nope' }],
  ['phone with too few digits', { phone: '12345' }],
  ['description over the limit', { campaignDescription: 'x'.repeat(2001) }],
  ['video over the size limit', { video: { fileName: 'a.mp4', mimeType: 'video/mp4', bytes: MAX_VIDEO_BYTES + 1 } }],
  ['video with an empty filename', { video: { fileName: '   ', mimeType: 'video/mp4', bytes: 10 } }],
];

for (const [label, override] of REJECTED) {
  const parsed = campaignDraftSchema.safeParse({ ...VALID, ...override });
  check(`rejects ${label}`, !parsed.success);
}

// 7. A path in the filename is stripped — the value ends up in a Content-Disposition header.
const stripped = campaignDraftSchema.safeParse({
  ...VALID,
  video: { fileName: '../../etc/passwd.mp4', mimeType: 'video/mp4', bytes: 10 },
});
check(
  'strips directory components from the filename',
  stripped.success && stripped.data.video?.fileName === 'passwd.mp4',
  stripped.success ? stripped.data.video?.fileName : 'parse failed',
);

console.log(
  failures === 0 ? '\n  all schema checks passed\n' : `\n  ${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);