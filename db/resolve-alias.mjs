import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * Resolve the `@/` path alias outside Next.
 *
 * Application code imports through `@/…` because `tsconfig.json` maps it to the project root. Next
 * resolves that alias itself, but `node` does not: run a script that touches an app module directly
 * and it fails with `Cannot find package '@/lib'`. The script is not wrong, and neither is the import
 * style — the loader is just missing the one piece Next would have supplied.
 *
 * This adds that piece. It is worth having beyond the check script: the upload pipeline, a nightly
 * reporting job and a seeding script all need to run under plain `node`, and all of them will import
 * the same `@/lib/...` modules this repository is built from.
 *
 * Mounted by `db/register-alias.mjs`; nothing else needs to know it exists.
 */

const ROOT = pathToFileURL(`${process.cwd()}/`).href;

/**
 * Node's ESM resolver requires an explicit extension, whereas every import in this codebase is
 * extensionless. Each candidate is probed on disk in the order a bundler would try them, so the
 * behaviour matches what `next build` does rather than merely being close enough.
 */
const SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx'];

async function firstExistingFile(url) {
  for (const suffix of SUFFIXES) {
    const candidate = new URL(url.href + suffix);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Not this suffix; keep trying.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/headers') {
    return nextResolve('next/headers.js', context);
  }
  if (!specifier.startsWith('@/')) {
    return nextResolve(specifier, context);
  }

  const target = await firstExistingFile(new URL(specifier.slice(2), ROOT));

  // Fall through to the default resolver when nothing matches, so the failure is Node's normal
  // "cannot find module" error with the original specifier rather than a confusing bare-path one.
  return nextResolve(target ? target.href : specifier, context);
}
