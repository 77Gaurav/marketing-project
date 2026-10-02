import { register } from 'node:module';

/**
 * Installs the `@/` alias resolver for a plain-`node` run.
 *
 * Usage:  node --import ./db/register-alias.mjs <script>
 *
 * Kept to two lines so it can sit in front of any script without becoming the thing a reader has to
 * understand before they trust the script. The behaviour lives in `db/resolve-alias.mjs`.
 */
register('./resolve-alias.mjs', import.meta.url);
