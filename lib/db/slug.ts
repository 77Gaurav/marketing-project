/**
 * URL slugs for brands and campaigns.
 *
 * Slugs exist so a detail page can be linked to and read out loud over the phone. They are unique
 * per parent (per brand, for campaigns) rather than globally, so two brands can both run a
 * "spring-launch" without colliding.
 */

/**
 * Lowercase ASCII words joined by hyphens.
 *
 * Diacritics are folded to their base letter rather than dropped, so "Café Noir" becomes
 * "cafe-noir" and not "caf-noir". Anything that survives as empty becomes `item`, because a blank
 * slug would produce a URL with no path segment in it.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    // Combining marks left behind by NFKD decomposition.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    // 64 characters keeps a slug well inside a URL bar on a phone and inside a unique index's
    // practical key width once the collision suffix is appended.
    .slice(0, 64)
    .replace(/-+$/g, '');

  return slug === '' ? 'item' : slug;
}

/**
 * Derive a slug that `isTaken` does not claim, by appending -2, -3 and so on.
 *
 * Suffixes beat random tokens here: a human reading a URL should be able to guess it, and the
 * collision case is rare enough that a bounded linear scan costs nothing.
 */
export async function uniqueSlug(
  source: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(source);

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Could not derive a unique slug from "${source}" after 50 attempts.`);
}