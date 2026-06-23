import type { Request, RequestHandler, Response } from 'express';
import type { ImageService } from '../services/ImageService';
import { asyncHandler } from '../utils/asyncHandler';
import type { BulkCreateImagesBody, ListImagesQuery } from '../validation/schemas';

export function imageController(service: ImageService): {
  createForProject: RequestHandler;
  listForProject: RequestHandler;
  getById: RequestHandler;
} {
  return {
    createForProject: asyncHandler(async (req: Request, res: Response) => {
      const result = await service.createForProject(
        req.params.projectId,
        req.body as BulkCreateImagesBody,
      );
      res.status(201).json(result);
    }),

    listForProject: asyncHandler(async (req: Request, res: Response) => {
      const page = await service.listForProject(
        req.params.projectId,
        req.query as unknown as ListImagesQuery,
      );
      res.json(page);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.getById(req.params.id));
    }),
  };
}
