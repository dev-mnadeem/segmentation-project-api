import type {
  Annotation,
  AnnotatorTally,
  Image,
  ImageStatus,
  Page,
  Project,
  ProjectStatus,
  User,
  UserWithSecret,
} from './models';
import type { Segmentation } from './segmentation';

/**
 * Persistence ports. Services depend on these interfaces only; the Mongo
 * adapters in `src/repositories/mongo` and the in-process adapters in
 * `src/repositories/memory` are the two implementations. Adding a third (SQL,
 * a cache-through decorator, a fake that injects failures) means implementing
 * this file and nothing else.
 */

/**
 * A unit of work groups writes that must land together. The Mongo adapter maps
 * it onto a client session with a transaction; the in-memory adapter runs the
 * callback directly. Pass the handle down to every repository call inside.
 */
export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** Opaque transaction handle. Only the adapter that issued it understands it. */
export interface Transaction {
  readonly kind: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: User['role'];
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithSecret | null>;
  findManyByIds(ids: string[]): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  createdBy?: string;
}

export interface ListProjectsQuery {
  status?: ProjectStatus;
  page: number;
  limit: number;
}

export interface ProjectRepository {
  create(input: CreateProjectInput, tx?: Transaction): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  list(query: ListProjectsQuery): Promise<Page<Project>>;
}

export interface CreateImageInput {
  projectId: string;
  uri: string;
  width: number;
  height: number;
  status?: ImageStatus;
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

export interface ListImagesQuery {
  projectId: string;
  status?: ImageStatus;
  page: number;
  limit: number;
}

export interface ImageRepository {
  findById(id: string): Promise<Image | null>;
  createMany(inputs: CreateImageInput[], tx?: Transaction): Promise<Image[]>;
  list(query: ListImagesQuery): Promise<Page<Image>>;
  countByProject(projectId: string): Promise<number>;
  setStatus(id: string, status: ImageStatus, tx?: Transaction): Promise<void>;
}

export interface CreateAnnotationInput {
  projectId: string;
  imageId: string;
  label: string;
  segmentation: Segmentation;
  area: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ListAnnotationsQuery {
  projectId?: string;
  imageId?: string;
  label?: string;
  createdBy?: string;
  page: number;
  limit: number;
}

export interface AnnotationRepository {
  create(input: CreateAnnotationInput, tx?: Transaction): Promise<Annotation>;
  findById(id: string): Promise<Annotation | null>;
  list(query: ListAnnotationsQuery): Promise<Page<Annotation>>;
  countByProject(projectId: string): Promise<number>;
  /** How many annotations on `imageId` have a strictly larger area. */
  countLargerOnImage(imageId: string, area: number): Promise<number>;
  countOnImage(imageId: string): Promise<number>;
  /** One grouped pass over a project's annotations — never a per-user query. */
  tallyByAnnotator(projectId: string, limit: number): Promise<AnnotatorTally[]>;
  /** Every annotation in a project, ordered oldest-first, capped at `limit`. */
  listForExport(projectId: string, limit: number): Promise<Annotation[]>;
  /** Recent annotations in a project, newest-first — used to learn label shapes. */
  recentByProject(projectId: string, limit: number): Promise<Annotation[]>;
}

/** Everything a service may reach for. Assembled once in `src/container.ts`. */
export interface RepositorySet {
  users: UserRepository;
  projects: ProjectRepository;
  images: ImageRepository;
  annotations: AnnotationRepository;
  unitOfWork: UnitOfWork;
}
