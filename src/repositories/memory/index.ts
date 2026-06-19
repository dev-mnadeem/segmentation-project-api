import { randomBytes } from 'crypto';
import type {
  Annotation,
  AnnotatorTally,
  Image,
  Page,
  Project,
  User,
  UserWithSecret,
} from '../../domain/models';
import type {
  AnnotationRepository,
  CreateAnnotationInput,
  CreateImageInput,
  CreateProjectInput,
  CreateUserInput,
  ImageRepository,
  ListAnnotationsQuery,
  ListImagesQuery,
  ListProjectsQuery,
  ProjectRepository,
  RepositorySet,
  Transaction,
  UnitOfWork,
  UserRepository,
} from '../../domain/ports';

/**
 * In-process implementations of every persistence port.
 *
 * Two jobs: the API boots with `PERSISTENCE=memory` and no database at all
 * (useful for a five-second demo), and the HTTP test suite exercises the real
 * Express stack with no Mongo, no container and no network.
 *
 * Ids are 24-char hex so they satisfy the same validation as Mongo ObjectIds.
 */

function newId(): string {
  return randomBytes(12).toString('hex');
}

/**
 * Wall-clock time, but never repeating: two records written in the same
 * millisecond would otherwise tie and make `createdAt` ordering unstable.
 */
let lastIssued = 0;
function nextTimestamp(): Date {
  lastIssued = Math.max(Date.now(), lastIssued + 1);
  return new Date(lastIssued);
}

function paginate<T>(items: T[], page: number, limit: number): Page<T> {
  const start = (page - 1) * limit;
  return { page, limit, total: items.length, items: items.slice(start, start + limit) };
}

const newestFirst = (a: { createdAt: Date }, b: { createdAt: Date }) =>
  b.createdAt.getTime() - a.createdAt.getTime();

/**
 * There is nothing to roll back in a single-process map, so the unit of work
 * just runs the callback. It exists so services can be written once against
 * the port instead of branching on which adapter is installed.
 */
export class MemoryUnitOfWork implements UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return work({ kind: 'memory' });
  }
}

export class MemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserWithSecret>();

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const needle = email.toLowerCase();
    for (const user of this.byId.values()) {
      if (user.email === needle) return { ...user };
    }
    return null;
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    return ids
      .map((id) => this.byId.get(id))
      .filter((user): user is UserWithSecret => Boolean(user))
      .map(({ passwordHash: _passwordHash, ...user }) => user);
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase();
    if (await this.findByEmail(email)) {
      // Mirrors the Mongo unique-index violation so the service sees one shape.
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }
    const now = nextTimestamp();
    const record: UserWithSecret = {
      id: newId(),
      name: input.name,
      email,
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    const { passwordHash: _passwordHash, ...user } = record;
    return user;
  }
}

export class MemoryProjectRepository implements ProjectRepository {
  readonly byId = new Map<string, Project>();

  async create(input: CreateProjectInput): Promise<Project> {
    const now = nextTimestamp();
    const project: Project = {
      id: newId(),
      name: input.name,
      description: input.description,
      status: 'active',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(project.id, project);
    return { ...project };
  }

  async findById(id: string): Promise<Project | null> {
    const project = this.byId.get(id);
    return project ? { ...project } : null;
  }

  async list(query: ListProjectsQuery): Promise<Page<Project>> {
    const matches = [...this.byId.values()]
      .filter((project) => !query.status || project.status === query.status)
      .sort(newestFirst);
    return paginate(matches, query.page, query.limit);
  }
}

export class MemoryImageRepository implements ImageRepository {
  readonly byId = new Map<string, Image>();

  async findById(id: string): Promise<Image | null> {
    const image = this.byId.get(id);
    return image ? { ...image } : null;
  }

  async createMany(inputs: CreateImageInput[]): Promise<Image[]> {
    return inputs.map((input) => {
      const now = nextTimestamp();
      const image: Image = {
        id: newId(),
        projectId: input.projectId,
        uri: input.uri,
        width: input.width,
        height: input.height,
        status: input.status ?? 'unassigned',
        assignedTo: input.assignedTo,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      };
      this.byId.set(image.id, image);
      return { ...image };
    });
  }

  async list(query: ListImagesQuery): Promise<Page<Image>> {
    const matches = [...this.byId.values()]
      .filter((image) => image.projectId === query.projectId)
      .filter((image) => !query.status || image.status === query.status)
      .sort(newestFirst);
    return paginate(matches, query.page, query.limit);
  }

  async countByProject(projectId: string): Promise<number> {
    let count = 0;
    for (const image of this.byId.values()) {
      if (image.projectId === projectId) count += 1;
    }
    return count;
  }

  async setStatus(id: string, status: Image['status']): Promise<void> {
    const image = this.byId.get(id);
    if (image) {
      this.byId.set(id, { ...image, status, updatedAt: nextTimestamp() });
    }
  }
}

export class MemoryAnnotationRepository implements AnnotationRepository {
  readonly byId = new Map<string, Annotation>();

  async create(input: CreateAnnotationInput): Promise<Annotation> {
    const now = nextTimestamp();
    const annotation: Annotation = {
      id: newId(),
      projectId: input.projectId,
      imageId: input.imageId,
      label: input.label,
      segmentation: input.segmentation,
      area: input.area,
      createdBy: input.createdBy,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(annotation.id, annotation);
    return { ...annotation };
  }

  async findById(id: string): Promise<Annotation | null> {
    const annotation = this.byId.get(id);
    return annotation ? { ...annotation } : null;
  }

  private matching(query: Partial<ListAnnotationsQuery>): Annotation[] {
    return [...this.byId.values()].filter((annotation) => {
      if (query.projectId && annotation.projectId !== query.projectId) return false;
      if (query.imageId && annotation.imageId !== query.imageId) return false;
      if (query.label && annotation.label !== query.label) return false;
      if (query.createdBy && annotation.createdBy !== query.createdBy) return false;
      return true;
    });
  }

  async list(query: ListAnnotationsQuery): Promise<Page<Annotation>> {
    return paginate(this.matching(query).sort(newestFirst), query.page, query.limit);
  }

  async countByProject(projectId: string): Promise<number> {
    return this.matching({ projectId }).length;
  }

  async countLargerOnImage(imageId: string, area: number): Promise<number> {
    return this.matching({ imageId }).filter((annotation) => annotation.area > area).length;
  }

  async countOnImage(imageId: string): Promise<number> {
    return this.matching({ imageId }).length;
  }

  async tallyByAnnotator(projectId: string, limit: number): Promise<AnnotatorTally[]> {
    const counts = new Map<string | null, number>();
    for (const annotation of this.matching({ projectId })) {
      const key = annotation.createdBy ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([annotatorId, count]) => ({ annotatorId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async listForExport(projectId: string, limit: number): Promise<Annotation[]> {
    return this.matching({ projectId })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  async recentByProject(projectId: string, limit: number): Promise<Annotation[]> {
    return this.matching({ projectId }).sort(newestFirst).slice(0, limit);
  }
}

export function createMemoryRepositories(): RepositorySet {
  return {
    users: new MemoryUserRepository(),
    projects: new MemoryProjectRepository(),
    images: new MemoryImageRepository(),
    annotations: new MemoryAnnotationRepository(),
    unitOfWork: new MemoryUnitOfWork(),
  };
}
