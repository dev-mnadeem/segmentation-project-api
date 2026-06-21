import mongoose, { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type {
  Annotation,
  AnnotatorTally,
  Image,
  Page,
  Project,
  User,
  UserWithSecret,
} from '../../domain/models';
import type {
  AnnotationRepository,
  CreateAnnotationInput,
  CreateImageInput,
  CreateProjectInput,
  CreateUserInput,
  ImageRepository,
  ListAnnotationsQuery,
  ListImagesQuery,
  ListProjectsQuery,
  ProjectRepository,
  RepositorySet,
  Transaction,
  UnitOfWork,
  UserRepository,
} from '../../domain/ports';
import { AnnotationModel, type AnnotationDoc } from '../../models/Annotation';
import { ImageModel, type ImageDoc } from '../../models/Image';
import { ProjectModel, type ProjectDoc } from '../../models/Project';
import { UserModel, type UserDoc } from '../../models/User';
import { toAnnotation, toImage, toProject, toUser, toUserWithSecret } from './mappers';

/** A `Transaction` carrying a Mongo client session. */
interface MongoTransaction extends Transaction {
  readonly kind: 'mongo';
  readonly session: ClientSession;
}

const sessionOf = (tx?: Transaction): ClientSession | undefined =>
  tx && tx.kind === 'mongo' ? (tx as MongoTransaction).session : undefined;

const oid = (value: string) => new Types.ObjectId(value);

/**
 * MongoDB transactions require a replica set. A standalone `mongod` — which is
 * what `docker compose up` gives you — rejects `startSession().withTransaction`
 * with an "Transaction numbers are only allowed on a replica set member"
 * error. Rather than fail every write on a single-node deployment, we detect
 * that once and fall back to running the work without a session. The caller's
 * code is identical either way.
 */
export class MongoUnitOfWork implements UnitOfWork {
  private transactionsSupported: boolean | null = null;

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this.transactionsSupported === false) {
      return work({ kind: 'none' });
    }

    const session = await mongoose.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await work({ kind: 'mongo', session } as MongoTransaction);
      });
      this.transactionsSupported = true;
      return result!;
    } catch (error) {
      if (this.transactionsSupported === null && isUnsupportedTransactionError(error)) {
        this.transactionsSupported = false;
        return work({ kind: 'none' });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

function isUnsupportedTransactionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Transaction numbers are only allowed on a replica set') ||
    message.includes('Transactions are not supported') ||
    message.includes('IllegalOperation')
  );
}

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean<UserDoc>()
      .exec();
    return doc ? toUserWithSecret(doc) : null;
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const docs = await UserModel.find({ _id: { $in: ids.map(oid) } })
      .lean<UserDoc[]>()
      .exec();
    return docs.map(toUser);
  }

  async create(input: CreateUserInput): Promise<User> {
    const created = await UserModel.create(input);
    return toUser(created.toObject() as UserDoc);
  }
}

export class MongoProjectRepository implements ProjectRepository {
  async create(input: CreateProjectInput, tx?: Transaction): Promise<Project> {
    const [created] = await ProjectModel.create(
      [{ ...input, createdBy: input.createdBy ? oid(input.createdBy) : undefined }],
      { session: sessionOf(tx) },
    );
    return toProject(created.toObject() as ProjectDoc);
  }

  async findById(id: string): Promise<Project | null> {
    const doc = await ProjectModel.findById(id).lean<ProjectDoc>().exec();
    return doc ? toProject(doc) : null;
  }

  async list(query: ListProjectsQuery): Promise<Page<Project>> {
    const filter: FilterQuery<ProjectDoc> = {};
    if (query.status) filter.status = query.status;
    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      ProjectModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ProjectDoc[]>()
        .exec(),
      ProjectModel.countDocuments(filter).exec(),
    ]);

    return { page: query.page, limit: query.limit, total, items: docs.map(toProject) };
  }
}

export class MongoImageRepository implements ImageRepository {
  async findById(id: string): Promise<Image | null> {
    const doc = await ImageModel.findById(id).lean<ImageDoc>().exec();
    return doc ? toImage(doc) : null;
  }

  async createMany(inputs: CreateImageInput[], tx?: Transaction): Promise<Image[]> {
    const docs = inputs.map((input) => ({
      project: oid(input.projectId),
      uri: input.uri,
      width: input.width,
      height: input.height,
      status: input.status ?? 'unassigned',
      assignedTo: input.assignedTo ? oid(input.assignedTo) : undefined,
      metadata: input.metadata,
    }));
    const created = await ImageModel.insertMany(docs, {
      ordered: true,
      session: sessionOf(tx),
    });
    return created.map((doc) => toImage(doc.toObject() as ImageDoc));
  }

  async list(query: ListImagesQuery): Promise<Page<Image>> {
    const filter: FilterQuery<ImageDoc> = { project: oid(query.projectId) };
    if (query.status) filter.status = query.status;
    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      ImageModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ImageDoc[]>()
        .exec(),
      ImageModel.countDocuments(filter).exec(),
    ]);

    return { page: query.page, limit: query.limit, total, items: docs.map(toImage) };
  }

  async countByProject(projectId: string): Promise<number> {
    return ImageModel.countDocuments({ project: oid(projectId) }).exec();
  }

  async setStatus(id: string, status: Image['status'], tx?: Transaction): Promise<void> {
    await ImageModel.updateOne({ _id: id }, { $set: { status } })
      .session(sessionOf(tx) ?? null)
      .exec();
  }
}

export class MongoAnnotationRepository implements AnnotationRepository {
  async create(input: CreateAnnotationInput, tx?: Transaction): Promise<Annotation> {
    const [created] = await AnnotationModel.create(
      [
        {
          project: oid(input.projectId),
          image: oid(input.imageId),
          label: input.label,
          segmentation: input.segmentation,
          area: input.area,
          createdBy: input.createdBy ? oid(input.createdBy) : undefined,
          metadata: input.metadata,
        },
      ],
      { session: sessionOf(tx) },
    );
    return toAnnotation(created.toObject() as AnnotationDoc);
  }

  async findById(id: string): Promise<Annotation | null> {
    const doc = await AnnotationModel.findById(id).lean<AnnotationDoc>().exec();
    return doc ? toAnnotation(doc) : null;
  }

  async list(query: ListAnnotationsQuery): Promise<Page<Annotation>> {
    const filter: FilterQuery<AnnotationDoc> = {};
    if (query.projectId) filter.project = oid(query.projectId);
    if (query.imageId) filter.image = oid(query.imageId);
    if (query.label) filter.label = query.label;
    if (query.createdBy) filter.createdBy = oid(query.createdBy);
    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      AnnotationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<AnnotationDoc[]>()
        .exec(),
      AnnotationModel.countDocuments(filter).exec(),
    ]);

    return { page: query.page, limit: query.limit, total, items: docs.map(toAnnotation) };
  }

  async countByProject(projectId: string): Promise<number> {
    return AnnotationModel.countDocuments({ project: oid(projectId) }).exec();
  }

  async countLargerOnImage(imageId: string, area: number): Promise<number> {
    return AnnotationModel.countDocuments({
      image: oid(imageId),
      area: { $gt: area },
    }).exec();
  }

  async countOnImage(imageId: string): Promise<number> {
    return AnnotationModel.countDocuments({ image: oid(imageId) }).exec();
  }

  /**
   * One `$group` over the project plus one batched `$in` lookup for the names.
   * Deliberately not a per-annotator query in a loop.
   */
  async tallyByAnnotator(projectId: string, limit: number): Promise<AnnotatorTally[]> {
    const rows = await AnnotationModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { project: oid(projectId) } },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]).exec();

    return rows.map((row) => ({
      annotatorId: row._id ? row._id.toHexString() : null,
      count: row.count,
    }));
  }

  async listForExport(projectId: string, limit: number): Promise<Annotation[]> {
    const docs = await AnnotationModel.find({ project: oid(projectId) })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean<AnnotationDoc[]>()
      .exec();
    return docs.map(toAnnotation);
  }

  async recentByProject(projectId: string, limit: number): Promise<Annotation[]> {
    const docs = await AnnotationModel.find({ project: oid(projectId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<AnnotationDoc[]>()
      .exec();
    return docs.map(toAnnotation);
  }
}

export function createMongoRepositories(): RepositorySet {
  return {
    users: new MongoUserRepository(),
    projects: new MongoProjectRepository(),
    images: new MongoImageRepository(),
    annotations: new MongoAnnotationRepository(),
    unitOfWork: new MongoUnitOfWork(),
  };
}
