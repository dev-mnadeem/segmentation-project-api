import { Router } from 'express';
import { imageController } from '../controllers/imageController';
import { validate } from '../middleware/validate';
import type { ImageService } from '../services/ImageService';
import { imageIdParamsZ } from '../validation/schemas';

export function imageRoutes(service: ImageService): Router {
  const router = Router();
  const controller = imageController(service);

  router.get('/:id', validate({ params: imageIdParamsZ }), controller.getById);

  return router;
}
