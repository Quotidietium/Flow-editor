import { resolve } from '$app/paths';

/** Legacy routes that ever existed in the hash format. */
const LEGACY_ROUTES = new Set(['edit', 'view']);

/**
 * Build the redirect URL for legacy root-path links.
 * Extracts the route and fragment from the old hash-based URL format,
 * and ensures search params (e.g. UTM) come before the hash fragment.
 * The route is whitelisted: the hash is untrusted and anything else
 * (e.g. `/../evil`) must not leak into the resolved path.
 */
export const buildRedirectUrl = (location: Location): string => {
  const parts = location.hash.split('/');
  let path = 'edit';
  let fragment = '';
  if (parts.length > 2 && LEGACY_ROUTES.has(parts[1] as string)) {
    path = parts[1] as string;
    fragment = `#${parts[2]}`;
  }
  return `${resolve(`/${path}`, {})}${location.search}${fragment}`;
};
