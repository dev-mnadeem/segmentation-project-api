import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_NUMBER, MAX_PAGE_SIZE } from '../config/constants';

/** A 24-character hex string — the serialised form of a Mongo ObjectId. */
export const objectIdZ = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex id');

/**
 * Pagination query parameters.
 *
 * `z.coerce.number()` is deliberate: it rejects `?page=abc` with a 400 instead
 * of producing `NaN` and letting it reach the database as a skip value.
 */
export const paginationZ = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE_NUMBER).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/** Free-text that must not be blank once trimmed. */
export const nonBlankString = (max: number) => z.string().trim().min(1).max(max);
