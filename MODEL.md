# Data model

Schemas, indexes and payload shapes for the segmentation API. Everything here
is stated as the code in `src/models/` and `src/validation/` implements it —
`npm test` covers the validation rules and `README.md` covers the API surface.

The domain records that cross the service boundary
(`src/domain/models.ts`) are **not** these documents: `id` is a string, dates
are `Date`, and `_id`, `__v` and `ObjectId` never leave
`src/repositories/mongo/mappers.ts`.

## User — `src/models/User.ts`

| Field                     | Type                      | Notes                                       |
| ------------------------- | ------------------------- | ------------------------------------------- |
| `name`                    | string, required, trimmed |                                             |
| `email`                   | string, required, unique  | Stored lowercase and trimmed                |
| `role`                    | enum                      | `annotator` \| `admin`, default `annotator` |
| `passwordHash`            | string, required          | `select: false` — not loaded unless asked   |
| `createdAt` / `updatedAt` | Date                      | `timestamps: true`                          |

`email` is lowercased by the schema, so `Ada@Example.com` and `ada@example.com`
collide on the unique index rather than becoming two accounts. A duplicate
signup returns **409** whether the check or the index catches it.

`passwordHash` is `select: false`; `AuthService.login` is the only caller that
asks for it, and no response shape includes it.

## Project — `src/models/Project.ts`

| Field         | Type                      | Notes                                    |
| ------------- | ------------------------- | ---------------------------------------- |
| `name`        | string, required, trimmed |                                          |
| `description` | string, trimmed           | Optional                                 |
| `status`      | enum                      | `active` \| `archived`, default `active` |
| `createdBy`   | ObjectId -> User          | Optional                                 |

Indexes: `{ status: 1, createdAt: -1 }`, `{ createdAt: -1 }` — the two shapes
`GET /projects` runs, filtered or not, both sorted newest-first.

Nothing sets `status` to `archived` yet; there is no archive endpoint.

## Image — `src/models/Image.ts`

| Field              | Type                      | Notes                                        |
| ------------------ | ------------------------- | -------------------------------------------- |
| `project`          | ObjectId -> Project, req. |                                              |
| `uri`              | string, required, trimmed | Validated as a URL on input                  |
| `width` / `height` | number, required, min 1   | Pixels                                       |
| `status`           | enum                      | `unassigned` \| `in_progress` \| `annotated` |
| `assignedTo`       | ObjectId -> User          | Optional                                     |
| `metadata`         | Mixed                     | Optional, free-form                          |

Indexes: `{ project: 1, createdAt: -1 }`, `{ project: 1, status: 1, createdAt: -1 }`.

Creating an annotation sets the image's `status` to `annotated` in the same unit
of work as the annotation insert. Nothing sets `in_progress` — there is no
assignment endpoint.

## Annotation — `src/models/Annotation.ts`

| Field          | Type                        | Notes                        |
| -------------- | --------------------------- | ---------------------------- |
| `project`      | ObjectId -> Project, req.   | Denormalised from the image  |
| `image`        | ObjectId -> Image, required |                              |
| `label`        | string, required, trimmed   |                              |
| `segmentation` | Mixed, required             | Polygon or RLE, shapes below |
| `area`         | number, required, min 0     | Computed by `lib/geometry`   |
| `createdBy`    | ObjectId -> User            | Optional                     |
| `metadata`     | Mixed                       | Optional, free-form          |

Indexes:

| Index                             | Serves                                 |
| --------------------------------- | -------------------------------------- |
| `{ image: 1, area: -1 }`          | `GET /annotations/:id/rank`            |
| `{ project: 1, createdAt: -1 }`   | `?projectId=` list                     |
| `{ image: 1, createdAt: -1 }`     | `?imageId=` list                       |
| `{ label: 1, createdAt: -1 }`     | `?label=` list                         |
| `{ createdBy: 1, createdAt: -1 }` | `?createdBy=` / `?annotator=` list     |
| `{ project: 1, createdAt: 1 }`    | `GET /projects/:id/annotations/export` |

Each filter is paired with the sort key so the index satisfies the sort as well
as the match, and Mongo never buffers the result set to sort it.

`segmentation` is `Mixed` deliberately. Its rules are enforced by Zod in
`src/validation/segmentation.ts` before the model is reached; a second, weaker
copy of them in the Mongoose schema would only drift.

## Relationships

```
Project 1--N Image        Image.project
Project 1--N Annotation   Annotation.project  (derived from the image)
Image   1--N Annotation   Annotation.image
User    1--N Project      Project.createdBy
User    1--N Annotation   Annotation.createdBy
User    1--N Image        Image.assignedTo
```

`Annotation.project` is always derived server-side from the image's project. A
request supplying a `project` that disagrees is rejected with **400**; the field
exists so project-scoped reads need no join.

## Segmentation shapes

### Polygon

```json
{
  "type": "polygon",
  "polygons": [
    {
      "rings": [
        [
          [10, 10],
          [100, 10],
          [100, 100],
          [10, 100]
        ]
      ]
    }
  ]
}
```

- At least one polygon, at least one ring per polygon, at least three points
  per ring. Each point is a pair of finite numbers.
- Ring 0 is the outer boundary; any further rings are holes subtracted from it,
  with the result clamped at zero.
- **Rings are treated as closed.** Do not repeat the first point at the end —
  `ringArea` wraps to index 0 itself, so a repeated point adds a zero-area
  segment and changes nothing.
- The bounding box of the whole segmentation must lie inside the image frame.

### RLE

```json
{ "type": "rle", "size": [480, 640], "counts": [1000, 200, 300, 150, 305950] }
```

- `size` is `[height, width]` and must equal the target image's dimensions.
- `counts` alternates run lengths starting with **background**, so the odd
  indices are foreground. That is COCO's convention.
- `counts` must sum to exactly `height * width`. A mask that does not cover the
  image is rejected with **400**.

## Area

`area` is always computed server-side by `segmentationArea` in
`src/lib/geometry.ts`:

- **polygon** — shoelace formula per ring, `|sum(x1*y2 - x2*y1)| / 2`, outer
  ring minus holes, clamped at zero, summed across polygons.
- **RLE** — the sum of the odd-indexed runs.

A request may include `area`. It is treated as an assertion, not an input: if it
differs from the computed value by more than `1e-6` the request is rejected with
**400**. A computed area of zero is rejected with `Segmentation encloses no
area`, which is what a degenerate (collinear) ring produces.

## Auth and attribution

`createdBy` defaults to the authenticated caller when a bearer token is present,
and an explicit `createdBy` in the body overrides it. When `AUTH_REQUIRED` is
on, the write endpoints — create project, bulk add images, create annotation,
suggest label — require a valid token; reads stay open.

Error responses are `{ error: { code, message, details?, requestId? } }`. See
the error table in `README.md`.
