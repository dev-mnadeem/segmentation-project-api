import type { Request, RequestHandler, Response } from 'express';
import type { ProjectService } from '../services/ProjectService';
import { asyncHandler } from '../utils/asyncHandler';
import type { CreateProjectBody, ListProjectsQuery } from '../validation/schemas';

export function projectController(service: ProjectService): {
  create: RequestHandler;
  getById: RequestHandler;
  list: RequestHandler;
  stats: RequestHandler;
} {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      const project = await service.create(req.body as CreateProjectBody, req.user?.id);
      res.status(201).json(project);
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.getById(req.params.id));
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.list(req.query as unknown as ListProjectsQuery));
    }),

    stats: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.stats(req.params.id));
    }),
  };
}
