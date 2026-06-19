import mongoose, { Schema, type Types } from 'mongoose';

export interface ImageDoc {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  uri: string;
  width: number;
  height: number;
  status: 'unassigned' | 'in_progress' | 'annotated';
  assignedTo?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ImageSchema = new Schema<ImageDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    uri: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['unassigned', 'in_progress', 'annotated'],
      default: 'unassigned',
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// `GET /projects/:id/images` pages by project, optionally narrowed by status.
ImageSchema.index({ project: 1, createdAt: -1 });
ImageSchema.index({ project: 1, status: 1, createdAt: -1 });

export const ImageModel = mongoose.model<ImageDoc>('Image', ImageSchema);
