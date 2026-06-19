import mongoose, { Schema, type Types } from 'mongoose';

export interface ProjectDoc {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<ProjectDoc>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// `GET /projects` filters on status and sorts newest-first; this covers both.
ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ createdAt: -1 });

export const ProjectModel = mongoose.model<ProjectDoc>('Project', ProjectSchema);
