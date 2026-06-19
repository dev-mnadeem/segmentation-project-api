/**
 * Segmentation geometry. These are plain data shapes with no database types in
 * them, so the same values flow from HTTP through the services into whichever
 * persistence adapter is wired up.
 */

export type Point = [number, number];

/** A closed ring of points. The first point is NOT repeated at the end. */
export type Ring = Point[];

/** One polygon: ring 0 is the outer boundary, any further rings are holes. */
export interface Polygon {
  rings: Ring[];
}

export interface PolygonSegmentation {
  type: 'polygon';
  polygons: Polygon[];
}

/**
 * Run-length encoding, COCO-style: `size` is `[height, width]` and `counts`
 * alternates background/foreground run lengths starting with background.
 */
export interface RleSegmentation {
  type: 'rle';
  size: [number, number];
  counts: number[];
}

export type Segmentation = PolygonSegmentation | RleSegmentation;

/** Axis-aligned bounding box as `[x, y, width, height]`. */
export type BoundingBox = [number, number, number, number];
