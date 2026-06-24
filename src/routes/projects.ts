import { Router } from 'express';
import { annotationController } from '../controllers/annotationController';
import { imageController } from '../controllers/imageController';
import { projectController } from '../controllers/projectController';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  bulkCreateImagesBodyZ,
  createProjectBodyZ,
  listImagesQueryZ,
  listProjectsQueryZ,
  projectIdParamsZ,
  projectScopedParamsZ,
} from '../validation/schemas';
import type { ApiRouterOptions } from './index';

export function projectRoutes(options: ApiRouterOptions): Router {
  const router = Router();
  const projects = projectController(options.services.projects);
  const images = imageController(options.services.images);
  const annotations = annotationController(options.services.annotations);
  const auth = requireAuth(options.auth);

  router.post('/', auth, validate({ body: createProjectBodyZ }), projects.create);
  router.get('/', validate({ query: listProjectsQueryZ }), projects.list);
  router.get('/:id', validate({ params: projectIdParamsZ }), projects.getById);
  router.get('/:id/stats', validate({ params: projectIdParamsZ }), projects.stats);

  router.get(
    '/:id/annotations/export',
    validate({ params: projectIdParamsZ }),
    annotations.exportForProject,
  );

  router.post(
    '/:projectId/images',
    auth,
    validate({ params: projectScopedParamsZ, body: bulkCreateImagesBodyZ }),
    images.createForProject,
  );
  router.get(
    '/:projectId/images',
    validate({ params: projectScopedParamsZ, query: listImagesQueryZ }),
    images.listForProject,
  );

  return router;
}
