import type { Segmentation } from './segmentation';

/**
 * Domain records. Every id is a plain string and every date is a `Date`:
 * nothing here is a Mongoose `Document` or an `ObjectId`, so controllers and
 * services never see the ORM.
 */

export type UserRole = 'annotator' | 'admin';
export type ProjectStatus = 'active' | 'archived';
export type ImageStatus = 'unassigned' | 'in_progress' | 'annotated';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/** A `User` plus the credential material. Never leaves the auth service. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Image {
  id: string;
  projectId: string;
  uri: string;
  width: number;
  height: number;
  status: ImageStatus;
  assignedTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Annotation {
  id: string;
  projectId: string;
  imageId: string;
  label: string;
  segmentation: Segmentation;
  area: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** One page of a list endpoint. `total` is the unpaginated match count. */
export interface Page<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface AnnotatorTally {
  annotatorId: string | null;
  count: number;
  name?: string;
  email?: string;
}

export interface ProjectStats {
  projectId: string;
  images: number;
  annotations: number;
  perAnnotator: AnnotatorTally[];
}
