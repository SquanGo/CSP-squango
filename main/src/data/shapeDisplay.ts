/**
 * Homepage display rotation per image, in whole pieces, keyed '<layer>:<layerName>'.
 * Rotates the image only; the tracing-start piece stays on its piece. Missing = 0,
 * which is the layer's reference frame (see layerShapes.ts). A positive value makes
 * the piece that many places after the first the new first piece.
 */
export const SHAPE_DISPLAY_ROTATIONS: Record<string, number> = {
  // Top layers
  'top:Barrel_top': 5,
  'top:Kite_top': 7,
  'top:Left_4_2': 4,
  'top:Left_5_1': 5,
  'top:Left_fist_top': 1,
  'top:Left_pawn_top': 2,
  'top:Mushroom_top': 6,
  'top:Right_4_2': 2,
  'top:Right_5_1': 6,
  'top:Right_fist_top': 5,
  'top:Right_pawn_top': 1,
  'top:Scallop_top': 2,
  'top:Shield_top': 1,
  'top:Square_top': 7,
  'top:svg_2_2_2': 7,
  'top:svg_3_1_2': 4,
  'top:svg_3_2_1': 2,
  'top:svg_4_1_1': 6,
  'top:svg_4_4': 8,
  'top:svg_5_3': 7,
  'top:svg_6': 5,
  'top:svg_6_2': 7,
  'top:svg_7_1': 7,
  'top:svg_8': 6,

  // Bottom layers
  'bottom:Barrel_bottom': 1,
  'bottom:Kite_bottom': 3,
  'bottom:Left_fist_bottom': 5,
  'bottom:Left_pawn_bottom': 2,
  'bottom:Mushroom_bottom': 2,
  'bottom:Paired_edges': 3,
  'bottom:Parallel_edges': 6,
  'bottom:Perpendicular_edges': 3,
  'bottom:Right_fist_bottom': 1,
  'bottom:Right_pawn_bottom': 1,
  'bottom:Scallop_bottom': 2,
  'bottom:Shield_bottom': 1,
};

export function getShapeDisplayRotation(layer: 'top' | 'bottom', layerName: string): number {
  return SHAPE_DISPLAY_ROTATIONS[`${layer}:${layerName}`] ?? 0;
}
