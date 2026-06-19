import mongoose, { Schema, type Types } from 'mongoose';

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: 'annotator' | 'admin';
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    // Stored lowercase so `a@x.com` and `A@X.com` collide on the unique index
    // instead of creating two accounts that can never both log in.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['annotator', 'admin'], default: 'annotator' },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<UserDoc>('User', UserSchema);
