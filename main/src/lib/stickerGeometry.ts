import { Vector3 } from 'three';

/** Offset a convex face's edges inward, without moving it off its surface. */
export function insetStickerFace(vertices: Vector3[], width: number): Vector3[] {
  const normal = new Vector3().crossVectors(
    vertices[1].clone().sub(vertices[0]),
    vertices[2].clone().sub(vertices[1]),
  ).normalize();

  return vertices.map((vertex, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    const incoming = vertex.clone().sub(previous).normalize();
    const outgoing = next.clone().sub(vertex).normalize();
    const inwardIncoming = new Vector3().crossVectors(normal, incoming);
    const inwardOutgoing = new Vector3().crossVectors(normal, outgoing);
    const offset = inwardIncoming.clone().add(inwardOutgoing)
      .multiplyScalar(width / (1 + inwardIncoming.dot(inwardOutgoing)));
    return vertex.clone().add(offset);
  });
}
