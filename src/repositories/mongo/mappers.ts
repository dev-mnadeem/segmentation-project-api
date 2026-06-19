import type { Types } from 'mongoose';
import type { Annotation, Image, Project, User, UserWithSecret } from '../../domain/models';
import type { AnnotationDoc } from '../../models/Annotation';
import type { ImageDoc } from '../../models/Image';
import type { ProjectDoc } from '../../models/Project';
import type { UserDoc } from '../../models/User';

/**
 * The only place Mongo types are converted into domain types. Keeping the
 * mapping here is what stops `_id`, `__v` and `ObjectId` from reaching a
 * controller and, from there, a JSON response.
 */

const id = (value: Types.ObjectId): string => value.toHexString();
const optionalId = (value?: Types.ObjectId | null): string | undefined =>
  value ? value.toHexString() : undefined;

export function toUser(doc: UserDoc): User {
  return {
    id: id(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toUserWithSecret(doc: UserDoc): UserWithSecret {
  return { ...toUser(doc), passwordHash: doc.passwordHash };
}

export function toProject(doc: ProjectDoc): Project {
  return {
    id: id(doc._id),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    createdBy: optionalId(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toImage(doc: ImageDoc): Image {
  return {
    id: id(doc._id),
    projectId: id(doc.project),
    uri: doc.uri,
    width: doc.width,
    height: doc.height,
    status: doc.status,
    assignedTo: optionalId(doc.assignedTo),
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toAnnotation(doc: AnnotationDoc): Annotation {
  return {
    id: id(doc._id),
    projectId: id(doc.project),
    imageId: id(doc.image),
    label: doc.label,
    segmentation: doc.segmentation,
    area: doc.area,
    createdBy: optionalId(doc.createdBy),
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
