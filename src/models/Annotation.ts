import mongoose, { Schema, type Types } from 'mongoose';
import type { Segmentation } from '../domain/segmentation';

export interface AnnotationDoc {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  image: Types.ObjectId;
  label: string;
  segmentation: Segmentation;
  area: number;
  createdBy?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AnnotationSchema = new Schema<AnnotationDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    image: { type: Schema.Types.ObjectId, ref: 'Image', required: true },
    label: { type: String, required: true, trim: true },
    // Geometry is validated by Zod before it reaches the model, so Mixed is the
    // honest schema type rather than a second, weaker copy of those rules.
    segmentation: { type: Schema.Types.Mixed, required: true },
    area: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Rank-within-image: counts annotations on one image with a larger area.
AnnotationSchema.index({ image: 1, area: -1 });
// The four list filters, each paired with the newest-first sort key so the
// index satisfies the sort too and Mongo never does an in-memory sort.
AnnotationSchema.index({ project: 1, createdAt: -1 });
AnnotationSchema.index({ image: 1, createdAt: -1 });
AnnotationSchema.index({ label: 1, createdAt: -1 });
AnnotationSchema.index({ createdBy: 1, createdAt: -1 });
// Export reads a whole project oldest-first.
AnnotationSchema.index({ project: 1, createdAt: 1 });

export const AnnotationModel = mongoose.model<AnnotationDoc>('Annotation', AnnotationSchema);
