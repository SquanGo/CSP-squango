import { describe, expect, test } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { insetStickerFace } from '../stickerGeometry';

const length = 150;
const edgeRadius = length / (2 * Math.cos(Math.PI / 12));
const cornerRadius = length / Math.sqrt(2);
// The triangle, corner, and side faces used by the reference Square-1 model.
const faces = [
  [[0, 0, 0], [0, -edgeRadius, 0], [edgeRadius / 2, -edgeRadius * Math.sin(Math.PI / 3), 0]],
  [[0, 0, 0], [0, -edgeRadius, 0], [cornerRadius / 2, -cornerRadius * Math.sin(Math.PI / 3), 0],
    [edgeRadius * Math.cos(Math.PI / 6), -edgeRadius / 2, 0]],
  [[0, -edgeRadius, 25], [edgeRadius / 2, -edgeRadius * Math.sin(Math.PI / 3), 25],
    [edgeRadius / 2, -edgeRadius * Math.sin(Math.PI / 3), -25], [0, -edgeRadius, -25]],
];

describe('Square-1 surface borders', () => {
  test.each(faces.map((face, index) => ({ face, index })))('face $index has a uniform inset that stays inside its surface', ({ face }) => {
    // Include reversed winding and a moving piece's arbitrary 3D orientation.
    const transform = new Matrix4().makeRotationX(0.7).multiply(new Matrix4().makeRotationZ(1.2));
    for (const reversed of [false, true]) {
      const vertices = face.map(([x, y, z]) => new Vector3(x, y, z).applyMatrix4(transform));
      if (reversed) vertices.reverse();
      const inset = insetStickerFace(vertices, 1.2);
      const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[1])).normalize();
      for (let i = 0; i < vertices.length; i++) {
        const edge = vertices[(i + 1) % vertices.length].clone().sub(vertices[i]).normalize();
        const inward = normal.clone().cross(edge);
        // Both endpoints are exactly the requested distance from their edge.
        expect(inset[i].clone().sub(vertices[i]).dot(inward)).toBeCloseTo(1.2, 10);
        expect(inset[(i + 1) % vertices.length].clone().sub(vertices[i]).dot(inward)).toBeCloseTo(1.2, 10);
        for (const point of inset) {
          expect(point.clone().sub(vertices[i]).dot(inward)).toBeGreaterThan(0);
          expect(point.clone().sub(vertices[i]).dot(normal)).toBeCloseTo(0, 10);
        }
      }
    }
  });

  test('border and sticker scale together with the model', () => {
    const vertices = faces[1].map(([x, y, z]) => new Vector3(x, y, z));
    const inset = insetStickerFace(vertices, 1.2);
    const scaled = insetStickerFace(vertices.map((v) => v.clone().multiplyScalar(4)), 4.8);
    scaled.forEach((vertex, index) => expect(vertex.distanceTo(inset[index].clone().multiplyScalar(4))).toBeCloseTo(0, 10));
  });
});
