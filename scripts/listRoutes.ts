import type { Express } from 'express';

export interface RouteEntry {
  method: string;
  path: string;
}

interface LayerLike {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: LayerLike[] };
  regexp?: RegExp;
}

/**
 * Walk an Express router stack and return every registered route.
 *
 * This is what keeps the Postman collection honest: the generator asks the
 * real app what it serves instead of trusting a hand-maintained list.
 */
export function listRoutes(app: Express): RouteEntry[] {
  const routes: RouteEntry[] = [];

  const walk = (stack: LayerLike[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const path = normalise(prefix + layer.route.path);
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled) routes.push({ method: method.toUpperCase(), path });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer.regexp));
      }
    }
  };

  walk((app as unknown as { _router: { stack: LayerLike[] } })._router.stack, '');
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Recover the literal mount path a router was attached at from its regexp. */
function mountPath(regexp?: RegExp): string {
  if (!regexp) return '';
  const match = /^\^\\\/((?:[\w\-.]|\\\/)*)\\\/\?/.exec(regexp.source);
  if (!match) return '';
  return '/' + match[1].replace(/\\\//g, '/');
}

function normalise(path: string): string {
  return path.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
}
