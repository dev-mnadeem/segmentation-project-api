import type { Image, Page } from '../domain/models';
import type { ImageRepository, ProjectRepository, UnitOfWork } from '../domain/ports';
import { ApiError } from '../lib/errors';
import type { BulkCreateImagesBody, ListImagesQuery } from '../validation/schemas';

export interface ImageServiceOptions {
  images: ImageRepository;
  projects: ProjectRepository;
  unitOfWork: UnitOfWork;
}

export interface BulkCreateResult {
  inserted: number;
  images: Image[];
}

export class ImageService {
  constructor(private readonly options: ImageServiceOptions) {}

  /**
   * Bulk-add images to a project.
   *
   * The whole batch goes through one unit of work: either every image lands or
   * none does. An ordered `insertMany` without a transaction would leave the
   * caller with a partially imported dataset and no way to tell where it
   * stopped.
   */
  async createForProject(
    projectId: string,
    input: BulkCreateImagesBody,
  ): Promise<BulkCreateResult> {
    const project = await this.options.projects.findById(projectId);
    if (!project) throw ApiError.notFound('Project does not exist');

    const images = await this.options.unitOfWork.run((tx) =>
      this.options.images.createMany(
        input.images.map((image) => ({ ...image, projectId: project.id })),
        tx,
      ),
    );

    return { inserted: images.length, images };
  }

  async getById(id: string): Promise<Image> {
    const image = await this.options.images.findById(id);
    if (!image) throw ApiError.notFound('Image does not exist');
    return image;
  }

  async listForProject(projectId: string, query: ListImagesQuery): Promise<Page<Image>> {
    const project = await this.options.projects.findById(projectId);
    if (!project) throw ApiError.notFound('Project does not exist');
    return this.options.images.list({ ...query, projectId });
  }
}
