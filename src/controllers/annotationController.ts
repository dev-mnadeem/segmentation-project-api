import type { Request, RequestHandler, Response } from 'express';
import type { AnnotationService } from '../services/AnnotationService';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  CreateAnnotationBody,
  ListAnnotationsQuery,
  SuggestLabelBody,
} from '../validation/schemas';

export function annotationController(service: AnnotationService): {
  create: RequestHandler;
  getById: RequestHandler;
  list: RequestHandler;
  rank: RequestHandler;
  exportForProject: RequestHandler;
  suggestLabel: RequestHandler;
} {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      const annotation = await service.create(req.body as CreateAnnotationBody, req.user?.id);
      res.status(201).json(annotation);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.getById(req.params.id));
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.list(req.query as unknown as ListAnnotationsQuery));
    }),

    rank: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.rank(req.params.id));
    }),

    exportForProject: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.exportForProject(req.params.id));
    }),

    suggestLabel: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.suggestLabel(req.body as SuggestLabelBody));
    }),
  };
}
