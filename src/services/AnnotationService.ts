import {
  AREA_COMPARISON_EPSILON,
  LABEL_SUGGESTION_SAMPLE_SIZE,
  MAX_EXPORT_ANNOTATIONS,
} from '../config/constants';
import type { LabelSuggester, SuggestLabelResult } from '../ai/types';
import { extractFeatures } from '../ai/features';
import type { Annotation, Image, Page } from '../domain/models';
import type { Segmentation } from '../domain/segmentation';
import type {
  AnnotationRepository,
  ImageRepository,
  ProjectRepository,
  UnitOfWork,
} from '../domain/ports';
import { ApiError } from '../lib/errors';
import { boundingBox, rleCoverage, segmentationArea } from '../lib/geometry';
import { toSegmentation } from '../validation/segmentation';
import type {
  CreateAnnotationBody,
  ListAnnotationsQuery,
  SuggestLabelBody,
} from '../validation/schemas';

export interface AnnotationServiceOptions {
  annotations: AnnotationRepository;
  images: ImageRepository;
  projects: ProjectRepository;
  unitOfWork: UnitOfWork;
  labelSuggester: LabelSuggester;
}

export interface AnnotationRank {
  annotationId: string;
  imageId: string;
  area: number;
  /** 1 = largest annotation on the image. */
  rank: number;
  total: number;
}

export interface AnnotationExport {
  projectId: string;
  exportedAt: string;
  truncated: boolean;
  count: number;
  annotations: Array<{
    id: string;
    imageId: string;
    label: string;
    area: number;
    bbox: [number, number, number, number];
    segmentation: Segmentation;
    createdBy?: string;
    createdAt: string;
  }>;
}

export class AnnotationService {
  constructor(private readonly options: AnnotationServiceOptions) {}

  /**
   * Create an annotation and mark its image annotated.
   *
   * Both writes run inside one unit of work. Previously the status update was
   * a fire-and-forget call wrapped in an empty `catch`, so a failure there left
   * an annotated image permanently reported as `unassigned`, with nothing in
   * the logs.
   */
  async create(input: CreateAnnotationBody, actorId?: string): Promise<Annotation> {
    const image = await this.options.images.findById(input.image);
    if (!image) throw ApiError.notFound('Image does not exist');

    if (input.project && input.project !== image.projectId) {
      throw ApiError.badRequest('project does not match the project the image belongs to');
    }

    const segmentation = toSegmentation(input.segmentation);
    this.assertMaskFitsImage(segmentation, image);

    const area = segmentationArea(segmentation);
    if (area <= 0) {
      throw ApiError.badRequest('Segmentation encloses no area');
    }
    if (input.area !== undefined && Math.abs(input.area - area) > AREA_COMPARISON_EPSILON) {
      throw ApiError.badRequest(
        `Client-supplied area ${input.area} does not match server-computed area ${area}`,
      );
    }

    return this.options.unitOfWork.run(async (tx) => {
      const annotation = await this.options.annotations.create(
        {
          projectId: image.projectId,
          imageId: image.id,
          label: input.label,
          segmentation,
          area,
          createdBy: input.createdBy ?? actorId,
          metadata: input.metadata,
        },
        tx,
      );
      await this.options.images.setStatus(image.id, 'annotated', tx);
      return annotation;
    });
  }

  async getById(id: string): Promise<Annotation> {
    const annotation = await this.options.annotations.findById(id);
    if (!annotation) throw ApiError.notFound('Annotation does not exist');
    return annotation;
  }

  async list(query: ListAnnotationsQuery): Promise<Page<Annotation>> {
    return this.options.annotations.list({
      projectId: query.projectId,
      imageId: query.imageId,
      label: query.label,
      createdBy: query.createdBy ?? query.annotator,
      page: query.page,
      limit: query.limit,
    });
  }

  /** Where this annotation sits by area among all annotations on the same image. */
  async rank(id: string): Promise<AnnotationRank> {
    const annotation = await this.getById(id);
    const [larger, total] = await Promise.all([
      this.options.annotations.countLargerOnImage(annotation.imageId, annotation.area),
      this.options.annotations.countOnImage(annotation.imageId),
    ]);
    return {
      annotationId: annotation.id,
      imageId: annotation.imageId,
      area: annotation.area,
      rank: larger + 1,
      total,
    };
  }

  /**
   * Flat export of a project's annotations with a bounding box per mask.
   * Capped, and the response says so, rather than streaming an unbounded body.
   */
  async exportForProject(projectId: string): Promise<AnnotationExport> {
    const project = await this.options.projects.findById(projectId);
    if (!project) throw ApiError.notFound('Project does not exist');

    // Fetch one past the cap so we can report truncation honestly.
    const rows = await this.options.annotations.listForExport(
      projectId,
      MAX_EXPORT_ANNOTATIONS + 1,
    );
    const truncated = rows.length > MAX_EXPORT_ANNOTATIONS;
    const annotations = truncated ? rows.slice(0, MAX_EXPORT_ANNOTATIONS) : rows;

    return {
      projectId,
      exportedAt: new Date().toISOString(),
      truncated,
      count: annotations.length,
      annotations: annotations.map((annotation) => ({
        id: annotation.id,
        imageId: annotation.imageId,
        label: annotation.label,
        area: annotation.area,
        bbox: boundingBox(annotation.segmentation),
        segmentation: annotation.segmentation,
        createdBy: annotation.createdBy,
        createdAt: annotation.createdAt.toISOString(),
      })),
    };
  }

  /** Rank candidate labels for a mask that has not been saved yet. */
  async suggestLabel(input: SuggestLabelBody): Promise<SuggestLabelResult> {
    const image = await this.options.images.findById(input.image);
    if (!image) throw ApiError.notFound('Image does not exist');

    const segmentation = toSegmentation(input.segmentation);
    this.assertMaskFitsImage(segmentation, image);

    const exemplars = await this.options.annotations.recentByProject(
      image.projectId,
      LABEL_SUGGESTION_SAMPLE_SIZE,
    );

    return this.options.labelSuggester.suggest({
      features: extractFeatures(segmentation, image.width, image.height),
      vocabulary: rankVocabulary(exemplars),
      exemplars,
      imageWidth: image.width,
      imageHeight: image.height,
    });
  }

  /**
   * Geometry has to agree with the image it is attached to. An RLE mask must
   * cover exactly `height * width` pixels; a polygon must stay inside the frame.
   */
  private assertMaskFitsImage(segmentation: Segmentation, image: Image): void {
    if (segmentation.type === 'rle') {
      const [height, width] = segmentation.size;
      if (height !== image.height || width !== image.width) {
        throw ApiError.badRequest(
          `RLE size [${height}, ${width}] must equal image dimensions [${image.height}, ${image.width}]`,
        );
      }
      const coverage = rleCoverage(segmentation);
      if (coverage !== height * width) {
        throw ApiError.badRequest(
          `RLE counts sum to ${coverage} but the mask must cover exactly ${height * width} pixels`,
        );
      }
      return;
    }

    const [x, y, width, height] = boundingBox(segmentation);
    if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
      throw ApiError.badRequest(
        `Polygon bounding box [${x}, ${y}, ${width}, ${height}] falls outside the ${image.width}x${image.height} image`,
      );
    }
  }
}

/** Distinct labels from a sample, most frequent first, ties broken alphabetically. */
function rankVocabulary(annotations: Annotation[]): string[] {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    counts.set(annotation.label, (counts.get(annotation.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}
