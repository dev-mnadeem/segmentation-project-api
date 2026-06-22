import { z } from 'zod';
import { MAX_IMAGES_PER_BULK_INSERT, MIN_PASSWORD_LENGTH } from '../config/constants';
import { nonBlankString, objectIdZ, paginationZ } from './common';
import { segmentationZ } from './segmentation';

/**
 * Every request shape the API accepts, declared once. Routes attach these via
 * `validate()`, so by the time a controller runs, `req.body` / `req.query` /
 * `req.params` are already the parsed, typed values — services never re-check
 * "is this field present".
 */

/* ---------- auth ---------- */

export const signupBodyZ = z.object({
  name: nonBlankString(200),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(['annotator', 'admin']).default('annotator'),
});

export const loginBodyZ = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

/* ---------- projects ---------- */

export const createProjectBodyZ = z.object({
  name: nonBlankString(200),
  description: z.string().trim().max(2_000).optional(),
  createdBy: objectIdZ.optional(),
});

export const listProjectsQueryZ = paginationZ.extend({
  status: z.enum(['active', 'archived']).optional(),
});

export const projectIdParamsZ = z.object({ id: objectIdZ });
export const projectScopedParamsZ = z.object({ projectId: objectIdZ });

/* ---------- images ---------- */

const imageInputZ = z.object({
  uri: z.string().trim().url().max(2_000),
  width: z.number().int().positive().max(1_000_000),
  height: z.number().int().positive().max(1_000_000),
  status: z.enum(['unassigned', 'in_progress', 'annotated']).default('unassigned'),
  assignedTo: objectIdZ.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const bulkCreateImagesBodyZ = z.object({
  images: z.array(imageInputZ).min(1).max(MAX_IMAGES_PER_BULK_INSERT),
});

export const listImagesQueryZ = paginationZ.extend({
  status: z.enum(['unassigned', 'in_progress', 'annotated']).optional(),
});

export const imageIdParamsZ = z.object({ id: objectIdZ });

/* ---------- annotations ---------- */

export const createAnnotationBodyZ = z.object({
  image: objectIdZ,
  project: objectIdZ.optional(),
  label: nonBlankString(200),
  segmentation: segmentationZ,
  /** Optional client-computed area. If present it must match the server's. */
  area: z.number().finite().nonnegative().optional(),
  createdBy: objectIdZ.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listAnnotationsQueryZ = paginationZ.extend({
  label: z.string().trim().min(1).max(200).optional(),
  imageId: objectIdZ.optional(),
  projectId: objectIdZ.optional(),
  /** Accepted under both names; `annotator` is the historical spelling. */
  annotator: objectIdZ.optional(),
  createdBy: objectIdZ.optional(),
});

export const annotationIdParamsZ = z.object({ id: objectIdZ });

export const suggestLabelBodyZ = z.object({
  image: objectIdZ,
  segmentation: segmentationZ,
});

export type SignupBody = z.infer<typeof signupBodyZ>;
export type LoginBody = z.infer<typeof loginBodyZ>;
export type CreateProjectBody = z.infer<typeof createProjectBodyZ>;
export type ListProjectsQuery = z.infer<typeof listProjectsQueryZ>;
export type BulkCreateImagesBody = z.infer<typeof bulkCreateImagesBodyZ>;
export type ListImagesQuery = z.infer<typeof listImagesQueryZ>;
export type CreateAnnotationBody = z.infer<typeof createAnnotationBodyZ>;
export type ListAnnotationsQuery = z.infer<typeof listAnnotationsQueryZ>;
export type SuggestLabelBody = z.infer<typeof suggestLabelBodyZ>;
