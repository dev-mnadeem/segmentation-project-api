import { Router } from 'express';
import { annotationController } from '../controllers/annotationController';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  annotationIdParamsZ,
  createAnnotationBodyZ,
  listAnnotationsQueryZ,
  suggestLabelBodyZ,
} from '../validation/schemas';
import type { ApiRouterOptions } from './index';

export function annotationRoutes(options: ApiRouterOptions): Router {
  const router = Router();
  const controller = annotationController(options.services.annotations);
  const auth = requireAuth(options.auth);

  router.post('/', auth, validate({ body: createAnnotationBodyZ }), controller.create);
  // Registered before `/:id` so "suggest-label" is never read as an id.
  router.post(
    '/suggest-label',
    auth,
    validate({ body: suggestLabelBodyZ }),
    controller.suggestLabel,
  );
  router.get('/', validate({ query: listAnnotationsQueryZ }), controller.list);
  router.get('/:id', validate({ params: annotationIdParamsZ }), controller.getById);
  router.get('/:id/rank', validate({ params: annotationIdParamsZ }), controller.rank);

  return router;
}
