import { MAX_ANNOTATORS_IN_STATS } from '../config/constants';
import type { AnnotatorTally, Page, Project, ProjectStats } from '../domain/models';
import type {
  AnnotationRepository,
  ImageRepository,
  ProjectRepository,
  UserRepository,
} from '../domain/ports';
import { ApiError } from '../lib/errors';
import type { CreateProjectBody, ListProjectsQuery } from '../validation/schemas';

export interface ProjectServiceOptions {
  projects: ProjectRepository;
  images: ImageRepository;
  annotations: AnnotationRepository;
  users: UserRepository;
}

export class ProjectService {
  constructor(private readonly options: ProjectServiceOptions) {}

  async create(input: CreateProjectBody, actorId?: string): Promise<Project> {
    return this.options.projects.create({
      name: input.name,
      description: input.description,
      createdBy: input.createdBy ?? actorId,
    });
  }

  async getById(id: string): Promise<Project> {
    const project = await this.options.projects.findById(id);
    if (!project) throw ApiError.notFound('Project does not exist');
    return project;
  }

  async list(query: ListProjectsQuery): Promise<Page<Project>> {
    return this.options.projects.list(query);
  }

  /**
   * Counts plus a per-annotator breakdown.
   *
   * The breakdown is two round trips regardless of how many annotators a
   * project has: one grouped aggregation, then one batched lookup of the names.
   * Resolving names one at a time would make this O(annotators) queries.
   */
  async stats(id: string): Promise<ProjectStats> {
    await this.getById(id);

    const [images, annotations, tallies] = await Promise.all([
      this.options.images.countByProject(id),
      this.options.annotations.countByProject(id),
      this.options.annotations.tallyByAnnotator(id, MAX_ANNOTATORS_IN_STATS),
    ]);

    return {
      projectId: id,
      images,
      annotations,
      perAnnotator: await this.withUserDetails(tallies),
    };
  }

  private async withUserDetails(tallies: AnnotatorTally[]): Promise<AnnotatorTally[]> {
    const ids = tallies.map((tally) => tally.annotatorId).filter((id): id is string => id !== null);
    if (ids.length === 0) return tallies;

    const users = await this.options.users.findManyByIds(ids);
    const byId = new Map(users.map((user) => [user.id, user]));

    return tallies.map((tally) => {
      const user = tally.annotatorId ? byId.get(tally.annotatorId) : undefined;
      return user ? { ...tally, name: user.name, email: user.email } : tally;
    });
  }
}
