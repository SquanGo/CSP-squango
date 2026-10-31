/**
 * Square-1 Scramble Visualizer — Modular Style System
 */

export function createSquare1Core(initialState = {}) {

    // =====================================================================
    // === CONSTANTS & DEFAULTS ============================================
    // =====================================================================

    const CORNER_HEX_VALUES = ['1', '3', '5', '7', '9', 'b', 'd', 'f'];

    const DEFAULT_PLACEHOLDER = {
        sticker: '#2a2a2a',
        slice: '#666666',
        border: '#000000',
    };

    function defaultPieceColors() {
        return {
            edgeColors: {
                '0': { inner: 'top', outer: 'back' },
                '2': { inner: 'top', outer: 'left' },
                '4': { inner: 'top', outer: 'front' },
                '6': { inner: 'top', outer: 'right' },
                '8': { inner: 'bottom', outer: 'right' },
                'a': { inner: 'bottom', outer: 'front' },
                'c': { inner: 'bottom', outer: 'left' },
                'e': { inner: 'bottom', outer: 'back' },
            },
            cornerColors: {
                '1': { top: 'top', left: 'back', right: 'left' },
                '3': { top: 'top', left: 'left', right: 'front' },
                '5': { top: 'top', left: 'front', right: 'right' },
                '7': { top: 'top', left: 'right', right: 'back' },
                '9': { top: 'bottom', left: 'back', right: 'right' },
                'b': { top: 'bottom', left: 'right', right: 'front' },
                'd': { top: 'bottom', left: 'front', right: 'left' },
                'f': { top: 'bottom', left: 'left', right: 'back' },
            },
            sliceColors: { top: 'top', bottom: 'bottom' },
        };
    }

    // =====================================================================
    // === PIECE COLOR STATE ===============================================
    // =====================================================================

    let edgeColors, cornerColors, sliceColors;

    function resetPiecesColors() {
        ({ edgeColors, cornerColors, sliceColors } = defaultPieceColors());
    }
    resetPiecesColors();
    if (initialState.piecesColors) setPiecesColors(initialState.piecesColors);

    // =====================================================================
    // === STYLE DEFINITIONS ===============================================
    // =====================================================================

    // Resolve a color name like "top" → hex via a colors object,
    // or pass through if it's already a hex string.
    function resolveColor(val, colors) {
        return val.charAt(0) === '#' ? val : (colors[val] ?? val);
    }

    function getStyleControlDefaults(style) {
        const defaults = {};
        for (const control of style.controls ?? []) {
            if (control.parts) {
                for (const part of Object.values(control.parts)) {
                    defaults[part.id] = part.default;
                }
            } else {
                defaults[control.id] = control.default;
            }
        }
        return defaults;
    }

    function getActiveStyleSettings() {
        const style = STYLES[activeStyleIndex];
        return { ...getStyleControlDefaults(style), ...(styleControlOverrides.get(style.source) ?? {}) };
    }

    function activeVariantUsesSideColors() {
        const style = STYLES[activeStyleIndex];
        return !style.hidableSideColor || showSideColors;
    }

    // -----------------------------------------------------------------
    // SAC2'S STYLE
    // -----------------------------------------------------------------
    const SAC2Style = {
        name: "SAC2's Design",
        placeholderScheme: { sticker: '#2a2a2a', slice: '#666666', border: '#000000' },
        source: 'SAC2',
        hidableSideColor: true,
        hasSliceIndicator: true,

        withSideColor: {
            layerScale: 1,
            colorSlots: [
                { id: 'top',    label: 'Top',    default: '#4d4d4d' },
                { id: 'bottom', label: 'Bottom', default: '#FFFFFF' },
                { id: 'front',  label: 'Front',  default: '#CC0000' },
                { id: 'right',  label: 'Right',  default: '#00AA00' },
                { id: 'back',   label: 'Back',   default: '#FF8C00' },
                { id: 'left',   label: 'Left',   default: '#0066CC' },
                { id: 'border', label: 'Border', default: '#000000' },
            ],

            drawEdge(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {

                let innerColor = resolveColor(edgeColors[piece].inner, colors);
                let outerColor = resolveColor(edgeColors[piece].outer, colors);

                if (muted) {
                    const def = defaultPieceColors().edgeColors[piece];
                    if (innerColor === colors[def.inner]) innerColor = ph.sticker;
                    if (outerColor === colors[def.outer]) outerColor = ph.sticker;
                }

                const scale = 54 / 27 * (size / 220);
                const ox = (50.0 / 100) * 27;
                const oy = (117.0 / 100) * 42.61;
                const tx = -ox * scale, ty = -oy * scale;

                const maskId = `mask-wsc-edge-${piece}-${Math.random().toString(36).slice(2)}`;

                return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})">

                    <defs>
                        <mask id="${maskId}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="M21.3,10.94c.88,0,1.66-.59,1.88-1.45l.78-2.92.51-1.91c.33-1.24-.6-2.45-1.88-2.45H4.41c-1.28,0-2.22,1.22-1.88,2.45l.51,1.91.78,2.92c.23.85,1,1.45,1.88,1.45h15.6Z" fill="black"/>
                            <path d="M19.67,13.14H7.34c-1.28,0-2.22,1.22-1.88,2.45l6.17,23.01c.52,1.93,3.25,1.93,3.77,0l6.17-23.01c.33-1.24-.6-2.45-1.88-2.45Z" fill="black"/>
                        </mask>
                    </defs>

                    <g mask="url(#${maskId})">
                        <path fill="${muted ? ph.border : colors.border}" d="M.11,4.17l2.4,8.97h21.97l2.4-8.97c.56-2.1-1.02-4.17-3.2-4.17H3.31C1.14,0-.45,2.07.11,4.17Z"/>
                        <path fill="${muted ? ph.border : colors.border}" d="M3.05,15.11l6.57,24.52c1.07,3.98,6.71,3.98,7.77,0l6.57-24.52c.56-2.1-1.02-4.17-3.2-4.17H6.24c-2.18,0-3.76,2.07-3.2,4.17Z"/>
                    </g>

                    <path class="sticker" id="${piece} outer" fill="${outerColor}" d="M21.3,10.94c.88,0,1.66-.59,1.88-1.45l.78-2.92.51-1.91c.33-1.24-.6-2.45-1.88-2.45H4.41c-1.28,0-2.22,1.22-1.88,2.45l.51,1.91.78,2.92c.23.85,1,1.45,1.88,1.45h15.6Z"/>
                    <path class="sticker" id="${piece} inner" fill="${innerColor}" d="M19.67,13.14H7.34c-1.28,0-2.22,1.22-1.88,2.45l6.17,23.01c.52,1.93,3.25,1.93,3.77,0l6.17-23.01c.33-1.24-.6-2.45-1.88-2.45Z"/>
                </g>`;
            },

            drawCorner(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {

                let topColor   = resolveColor(cornerColors[piece].top,   colors);
                let leftColor  = resolveColor(cornerColors[piece].left,  colors);
                let rightColor = resolveColor(cornerColors[piece].right, colors);

                if (muted) {
                    const def = defaultPieceColors().cornerColors[piece];
                    if (topColor   === colors[def.top])   topColor   = ph.sticker;
                    if (leftColor  === colors[def.left])  leftColor  = ph.sticker;
                    if (rightColor === colors[def.right]) rightColor = ph.sticker;
                }

                const scale = 96 / 48.5 * (size / 220);
                const ox = (-3.5 / 100) * 48.5;
                const oy = (103.5 / 100) * 48.5;
                const tx = -ox * scale, ty = -oy * scale;

                const maskId = `mask-wsc-corner-${piece}-${Math.random().toString(36).slice(2)}`;

                return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)}) rotate(-45,${ox.toFixed(2)},${oy.toFixed(2)})">

                    <defs>
                        <mask id="${maskId}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="M35.2,10.94c.52,0,1.01-.21,1.38-.57l.71-.71,5.72-5.72c.64-.64.19-1.73-.72-1.73H14.03c-.88,0-1.66.59-1.88,1.45l-.78,2.92-.51,1.91c-.33,1.24.6,2.45,1.88,2.45h22.47Z" fill="black"/>
                            <path d="M37.57,35.77c0,1.28,1.22,2.22,2.45,1.88l1.91-.51,2.92-.78c.85-.23,1.45-1,1.45-1.88V6.21c0-.9-1.09-1.36-1.73-.72l-5.72,5.72-.71.71c-.37.37-.57.86-.57,1.38v22.47Z" fill="black"/>
                            <path d="M33.92,39.28c.85-.23,1.45-1,1.45-1.88V15.09c0-1.08-.87-1.95-1.95-1.95H11.1c-.88,0-1.66.59-1.88,1.45l-7,26.12c-.91,3.39,2.19,6.49,5.58,5.58l26.12-7Z" fill="black"/>
                        </mask>
                    </defs>

                    <g mask="url(#${maskId})">
                        <path fill="${muted ? ph.border : colors.border}" d="M10.19,2.45l-2.86,10.68h24.73c1.83,0,3.31,1.48,3.31,3.31v24.73l10.68-2.86c1.45-.39,2.45-1.7,2.45-3.2V3.31c0-1.83-1.48-3.31-3.31-3.31H13.39c-1.5,0-2.81,1.01-3.2,2.45Z"/>
                        <path fill="${muted ? ph.border : colors.border}" d="M7.26,13.39L.25,39.56c-1.41,5.28,3.42,10.11,8.7,8.7l26.16-7.01c1.45-.39,2.45-1.7,2.45-3.2V14.25c0-1.83-1.48-3.31-3.31-3.31H10.46c-1.5,0-2.81,1.01-3.2,2.45Z"/>
                    </g>

                    <path class="sticker" id="${piece} right" fill="${rightColor}" d="M35.2,10.94c.52,0,1.01-.21,1.38-.57l.71-.71,5.72-5.72c.64-.64.19-1.73-.72-1.73H14.03c-.88,0-1.66.59-1.88,1.45l-.78,2.92-.51,1.91c-.33,1.24.6,2.45,1.88,2.45h22.47Z"/>
                    <path class="sticker" id="${piece} left"  fill="${leftColor}"  d="M37.57,35.77c0,1.28,1.22,2.22,2.45,1.88l1.91-.51,2.92-.78c.85-.23,1.45-1,1.45-1.88V6.21c0-.9-1.09-1.36-1.73-.72l-5.72,5.72-.71.71c-.37.37-.57.86-.57,1.38v22.47Z"/>
                    <path class="sticker" id="${piece} top"   fill="${topColor}"   d="M33.92,39.28c.85-.23,1.45-1,1.45-1.88V15.09c0-1.08-.87-1.95-1.95-1.95H11.1c-.88,0-1.66.59-1.88,1.45l-7,26.12c-.91,3.39,2.19,6.49,5.58,5.58l26.12-7Z"/>
                </g>`;
            },

            drawSlice(layer, cx, cy, size, colors, muted, ph = DEFAULT_PLACEHOLDER, relScale = 1.965) {
                const scale = (size / 220) * relScale;

                let topColor = resolveColor(sliceColors.top, colors);
                let botColor = resolveColor(sliceColors.bottom, colors);

                if (muted) {
                    const def = defaultPieceColors().sliceColors;
                    if (topColor === colors[def.top])    topColor = ph.slice;
                    if (botColor === colors[def.bottom]) botColor = ph.slice;
                }

                const color = layer === 'top' ? topColor : botColor;
                const angle = layer === 'top' ? 0 : -30;

                const tx = (cx + 29.5 / 220 * size).toFixed(2);
                const ty = (cy - 114 / 220 * size).toFixed(2);

                const maskId = `slice-mask-${layer}-${Math.random().toString(36).slice(2)}`;

                const arrowBasePath = `M7.32.86C6.69.13,5.72-.16,4.79.09c-.48.13-.91.4-1.23.77L.61,4.26C-.03,5.01-.18,6.03.23,6.92c.41.9,1.28,1.45,2.26,1.45h5.9c.22,0,.44-.03.65-.08.83-.22,1.47-.85,1.73-1.67.25-.82.07-1.7-.5-2.35L7.32.86Z`;

                const arrowColorPath = `M6.18,1.84c-.26-.3-.65-.4-1-.31-.18.05-.35.15-.49.31l-2.95,3.41c-.55.64-.1,1.63.74,1.63h5.9c.09,0,.18-.01.26-.03.67-.18.97-1.03.48-1.59l-2.95-3.41Z`;

                const transform = `rotate(%ROT%, ${cx}, ${cy}) translate(${tx}, ${ty}) scale(${scale.toFixed(4)}) translate(5.43, 4.19) rotate(-165)`;

                const maskedArrow = (rot) => `
                    <defs>
                        <mask id="${maskId}-${rot}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="${arrowColorPath}" fill="black"/>
                        </mask>
                    </defs>
                    <g transform="${transform.replace('%ROT%', rot)}">
                        <g mask="url(#${maskId}-${rot})">
                            <path fill="${muted ? ph.border : colors.border}" d="${arrowBasePath}"/>
                        </g>
                        <path class="sticker" id="slice ${layer}" fill="${color}" d="${arrowColorPath}"/>
                    </g>
                `;

                return maskedArrow(angle) + maskedArrow(angle + 180);
            },
        },

        withoutSideColor: {
            layerScale: 0.93,
            colorSlots: [
                { id: 'top',    label: 'Top',    default: '#4d4d4d' },
                { id: 'bottom', label: 'Bottom', default: '#FFFFFF' },
                { id: 'border', label: 'Border', default: '#000000' },
            ],

            drawEdge(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {

                let innerColor = resolveColor(edgeColors[piece].inner, colors);

                if (muted) {
                    const def = defaultPieceColors().edgeColors[piece];
                    if (innerColor === colors[def.inner]) innerColor = ph.sticker;
                }

                const scale = 54 / 27 * (size / 220) * 1.38;
                const ox = (50.0 / 100) * 27;
                const oy = (117.0 / 100) * 42.61;
                const tx = -ox * scale, ty = -oy * scale;

                const maskId = `mask-wosc-edge-${piece}-${Math.random().toString(36).slice(2)}`;

                return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})">

                    <defs>
                        <mask id="${maskId}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="M19.67,13.14H7.34c-1.28,0-2.22,1.22-1.88,2.45l6.17,23.01c.52,1.93,3.25,1.93,3.77,0l6.17-23.01c.33-1.24-.6-2.45-1.88-2.45Z" fill="black"/>
                        </mask>
                    </defs>

                    <g mask="url(#${maskId})">
                        <path fill="${muted ? ph.border : colors.border}" d="M3.05,15.11l6.57,24.52c1.07,3.98,6.71,3.98,7.77,0l6.57-24.52c.56-2.1-1.02-4.17-3.2-4.17H6.24c-2.18,0-3.76,2.07-3.2,4.17Z"/>
                    </g>

                    <path class="sticker" id="${piece} inner" fill="${innerColor}" d="M19.67,13.14H7.34c-1.28,0-2.22,1.22-1.88,2.45l6.17,23.01c.52,1.93,3.25,1.93,3.77,0l6.17-23.01c.33-1.24-.6-2.45-1.88-2.45Z"/>
                </g>`;
            },

            drawCorner(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {

                let topColor = resolveColor(cornerColors[piece].top, colors);

                if (muted) {
                    const def = defaultPieceColors().cornerColors[piece];
                    if (topColor === colors[def.top]) topColor = ph.sticker;
                }

                const scale = 96 / 48.5 * (size / 220) * 1.38;
                const ox = (-3.5 / 100) * 48.5;
                const oy = (103.5 / 100) * 48.5;
                const tx = -ox * scale, ty = -oy * scale;

                const maskId = `mask-wosc-corner-${piece}-${Math.random().toString(36).slice(2)}`;

                return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)}) rotate(-45,${ox.toFixed(2)},${oy.toFixed(2)})">

                    <defs>
                        <mask id="${maskId}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="M33.92,39.28c.85-.23,1.45-1,1.45-1.88V15.09c0-1.08-.87-1.95-1.95-1.95H11.1c-.88,0-1.66.59-1.88,1.45l-7,26.12c-.91,3.39,2.19,6.49,5.58,5.58l26.12-7Z" fill="black"/>
                        </mask>
                    </defs>

                    <g mask="url(#${maskId})">
                        <path fill="${muted ? ph.border : colors.border}" d="M7.26,13.39L.25,39.56c-1.41,5.28,3.42,10.11,8.7,8.7l26.16-7.01c1.45-.39,2.45-1.7,2.45-3.2V14.25c0-1.83-1.48-3.31-3.31-3.31H10.46c-1.5,0-2.81,1.01-3.2,2.45Z"/>
                    </g>

                    <path class="sticker" id="${piece} top" fill="${topColor}" d="M33.92,39.28c.85-.23,1.45-1,1.45-1.88V15.09c0-1.08-.87-1.95-1.95-1.95H11.1c-.88,0-1.66.59-1.88,1.45l-7,26.12c-.91,3.39,2.19,6.49,5.58,5.58l26.12-7Z"/>
                </g>`;
            },

            drawSlice(layer, cx, cy, size, colors, muted, ph = DEFAULT_PLACEHOLDER) {
                const scale = (size / 220) * (1.968 * 1.38 / 0.93);

                let topColor = resolveColor(sliceColors.top, colors);
                let botColor = resolveColor(sliceColors.bottom, colors);

                if (muted) {
                    const def = defaultPieceColors().sliceColors;
                    if (topColor === colors[def.top])    topColor = ph.slice;
                    if (botColor === colors[def.bottom]) botColor = ph.slice;
                }

                const color = layer === 'top' ? topColor : botColor;
                const angle = layer === 'top' ? 0 : -30;

                const tx = (cx + 29.5 / 220 * size).toFixed(2);
                const ty = (cy - 114 / 220 * size).toFixed(2);

                const maskId = `slice-mask-noside-${layer}-${Math.random().toString(36).slice(2)}`;

                const arrowBasePath = `M7.32.86C6.69.13,5.72-.16,4.79.09c-.48.13-.91.4-1.23.77L.61,4.26C-.03,5.01-.18,6.03.23,6.92c.41.9,1.28,1.45,2.26,1.45h5.9c.22,0,.44-.03.65-.08.83-.22,1.47-.85,1.73-1.67.25-.82.07-1.7-.5-2.35L7.32.86Z`;

                const arrowColorPath = `M6.18,1.84c-.26-.3-.65-.4-1-.31-.18.05-.35.15-.49.31l-2.95,3.41c-.55.64-.1,1.63.74,1.63h5.9c.09,0,.18-.01.26-.03.67-.18.97-1.03.48-1.59l-2.95-3.41Z`;

                const transform = `rotate(%ROT%, ${cx}, ${cy}) translate(${tx}, ${ty}) scale(${scale.toFixed(4)}) translate(5.43, 4.19) rotate(-165)`;

                const maskedArrow = (rot) => `
                    <defs>
                        <mask id="${maskId}-${rot}">
                            <rect width="100%" height="100%" fill="white"/>
                            <path d="${arrowColorPath}" fill="black"/>
                        </mask>
                    </defs>
                    <g transform="${transform.replace('%ROT%', rot)}">
                        <g mask="url(#${maskId}-${rot})">
                            <path fill="${muted ? ph.border : colors.border}" d="${arrowBasePath}"/>
                        </g>
                        <path class="sticker" id="slice ${layer}" fill="${color}" d="${arrowColorPath}"/>
                    </g>
                `;

                return maskedArrow(angle) + maskedArrow(angle + 180);
            },
        },
    };

    // -----------------------------------------------------------------
    // ABID'S STYLE
    // -----------------------------------------------------------------
    const AbidStyle = {
        name: "Abid's Design",
        placeholderScheme: { sticker: '#4d4d4d', slice: 'rgb(94, 94, 94)', border: '#000000' },
        source: 'Abid',
        hidableSideColor: false,
        hasSliceIndicator: true,
        controls: [
            { id: 'layerRatio', label: 'Layer Ratio', min: 0.0, max: 1, step: 0.01, default: 0.76, decimals: 2 },
            {
                type: 'linkedStrokeWidthSlider',
                label: 'Stroke Widths',
                tooltip: 'Adjust outer, slice, and inner stroke widths',
                parts: {
                    top: {
                        id: 'strokeWidthOuter',
                        label: 'Outer Stroke',
                        shortLabel: 'Outer',
                        tooltip: 'Outer stroke width',
                        min: 0,
                        max: 0.02,
                        step: 0.0005,
                        default: 0.012,
                        decimals: 4,
                    },
                    middle: {
                        id: 'sliceStrokeWidth',
                        label: 'Slice Stroke',
                        shortLabel: 'Slice',
                        tooltip: 'Slice stroke width',
                        min: 0,
                        max: 0.03,
                        step: 0.0005,
                        default: 0.012,
                        decimals: 4,
                    },
                    bottom: {
                        id: 'strokeWidthInner',
                        label: 'Inner Stroke',
                        shortLabel: 'Inner',
                        tooltip: 'Inner stroke width',
                        min: 0,
                        max: 0.02,
                        step: 0.0005,
                        default: 0.010,
                        decimals: 4,
                    },
                },
            },
        ],

        withSideColor: {
            layerScale: 1.64,
            colorSlots: [
                { id: 'top', label: 'Top', default: 'rgba(71,71,71,1)' },
                { id: 'bottom', label: 'Bottom', default: '#FFFFFF' },
                { id: 'front', label: 'Front', default: 'rgba(204,0,0,1)' },
                { id: 'right', label: 'Right', default: 'rgba(0,170,0,0.98)' },
                { id: 'back', label: 'Back', default: 'rgba(255,140,0,1)' },
                { id: 'left', label: 'Left', default: 'rgba(0,128,255,1)' },
                { id: 'border', label: 'Border', default: 'rgba(0,0,0,1)' },
                { id: 'slice-indicator', label: 'Slice Indicator', default: 'rgba(94,94,94,1)' },
            ],

            drawEdge(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER, settings = {}) {
                let innerColor = resolveColor(edgeColors[piece].inner, colors);
                let outerColor = resolveColor(edgeColors[piece].outer, colors);
                if (muted) {
                    const def = defaultPieceColors().edgeColors[piece];
                    if (innerColor === colors[def.inner]) innerColor = ph.sticker;
                    if (outerColor === colors[def.outer]) outerColor = ph.sticker;
                }
                const rOuter = size * 0.4 * 0.7, half = 15;
                const midR = rOuter * settings.layerRatio;
                function pt(r, deg) {
                    const rad = deg * Math.PI / 180;
                    return { x: +(r * Math.sin(rad)).toFixed(2), y: +(-r * Math.cos(rad)).toFixed(2) };
                }
                function ps(pts) { return pts.map(p => `${p.x},${p.y}`).join(' '); }
                const pi = { x: 0, y: 0 };
                const pA = pt(rOuter, -half), pB = pt(rOuter, half);
                const pmA = pt(midR, -half), pmB = pt(midR, half);
                const swOuter = (size * settings.strokeWidthOuter).toFixed(2);
                const swInner = (size * settings.strokeWidthInner).toFixed(2);
                const maskSeed = Math.random().toString(36).slice(2);
                const outerMaskId = `mask-abid-edge-outer-${piece}-${maskSeed}`;
                const innerMaskId = `mask-abid-edge-inner-${piece}-${maskSeed}`;
                const strokeAttrs = 'stroke-linejoin="round" stroke-linecap="round"';
                const col = muted ? ph.border : colors.border;
                const outerOutline = ps([pi, pA, pB]);
                return `
                    <defs>
                        <mask id="${outerMaskId}">
                            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                            <polygon points="${ps([pi, pmA, pmB])}" fill="black"/>
                            <line x1="${pmA.x}" y1="${pmA.y}" x2="${pmB.x}" y2="${pmB.y}" stroke="black" stroke-width="${swInner}" stroke-linecap="round"/>
                            <polygon points="${outerOutline}" fill="none" stroke="black" stroke-width="${swOuter}" ${strokeAttrs}/>
                        </mask>
                        <mask id="${innerMaskId}">
                            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                            <line x1="${pmA.x}" y1="${pmA.y}" x2="${pmB.x}" y2="${pmB.y}" stroke="black" stroke-width="${swInner}" stroke-linecap="round"/>
                            <polygon points="${outerOutline}" fill="none" stroke="black" stroke-width="${swOuter}" ${strokeAttrs}/>
                        </mask>
                    </defs>
                    <polygon class="sticker" id="${piece} outer" points="${ps([pmA, pA, pB, pmB])}" fill="${outerColor}" mask="url(#${outerMaskId})"/>
                    <polygon class="sticker" id="${piece} inner" points="${ps([pi, pmA, pmB])}" fill="${innerColor}" mask="url(#${innerMaskId})"/>
                    <line x1="${pmA.x}" y1="${pmA.y}" x2="${pmB.x}" y2="${pmB.y}" stroke="${col}" stroke-width="${swInner}" stroke-linecap="round"/>
                    <polygon points="${outerOutline}" fill="none" stroke="${col}" stroke-width="${swOuter}" ${strokeAttrs}/>
                `;
            },

            drawCorner(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER, settings = {}) {
                let topColor = resolveColor(cornerColors[piece].top, colors);
                let leftColor = resolveColor(cornerColors[piece].left, colors);
                let rightColor = resolveColor(cornerColors[piece].right, colors);
                if (muted) {
                    const def = defaultPieceColors().cornerColors[piece];
                    if (topColor === colors[def.top]) topColor = ph.sticker;
                    if (leftColor === colors[def.left]) leftColor = ph.sticker;
                    if (rightColor === colors[def.right]) rightColor = ph.sticker;
                }
                const rOuter = size * 0.4 * 0.7;
                const rApex = rOuter * 1.366025404;
                const half = 30, sf = settings.layerRatio;
                function pt(r, deg) {
                    const rad = deg * Math.PI / 180;
                    return { x: +(r * Math.sin(rad)).toFixed(2), y: +(-r * Math.cos(rad)).toFixed(2) };
                }
                function lerp(a, b, t) {
                    return { x: +((a.x + (b.x - a.x) * t).toFixed(2)), y: +((a.y + (b.y - a.y) * t).toFixed(2)) };
                }
                function ps(pts) { return pts.map(p => `${p.x},${p.y}`).join(' '); }
                const pi = { x: 0, y: 0 };
                const pOR = pt(rOuter, -half), pAp = pt(rApex, 0), pOL = pt(rOuter, half);
                const psL = lerp(pi, pOL, sf), psR = lerp(pi, pOR, sf), psB = lerp(pi, pAp, sf);
                const swOuter = (size * settings.strokeWidthOuter).toFixed(2);
                const swInner = (size * settings.strokeWidthInner).toFixed(2);
                const maskSeed = Math.random().toString(36).slice(2);
                const leftMaskId = `mask-abid-corner-left-${piece}-${maskSeed}`;
                const rightMaskId = `mask-abid-corner-right-${piece}-${maskSeed}`;
                const topMaskId = `mask-abid-corner-top-${piece}-${maskSeed}`;
                const col = muted ? ph.border : colors.border;
                const strokeAttrs = 'stroke-linejoin="round" stroke-linecap="round"';
                const leftPts = ps([pi, pOL, pAp, psB, psL]);
                const rightPts = ps([pi, psR, psB, pAp, pOR]);
                const topPts = ps([pi, psL, psB, psR]);
                const innerStrokePts = ps([psL, psB, psR]);
                const outerOutline = ps([pi, pOL, pAp, pOR]);
                return `
                    <defs>
                        <mask id="${leftMaskId}">
                            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                            <polygon points="${rightPts}" fill="black"/>
                            <polygon points="${topPts}" fill="black"/>
                            <polyline points="${innerStrokePts}" fill="none" stroke="black" stroke-width="${swInner}" ${strokeAttrs}/>
                            <line x1="${pAp.x}" y1="${pAp.y}" x2="${psB.x}" y2="${psB.y}" stroke="black" stroke-width="${swInner}" stroke-linecap="round"/>
                            <polygon points="${outerOutline}" fill="none" stroke="black" stroke-width="${swOuter}" ${strokeAttrs}/>
                        </mask>
                        <mask id="${rightMaskId}">
                            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                            <polygon points="${topPts}" fill="black"/>
                            <polyline points="${innerStrokePts}" fill="none" stroke="black" stroke-width="${swInner}" ${strokeAttrs}/>
                            <line x1="${pAp.x}" y1="${pAp.y}" x2="${psB.x}" y2="${psB.y}" stroke="black" stroke-width="${swInner}" stroke-linecap="round"/>
                            <polygon points="${outerOutline}" fill="none" stroke="black" stroke-width="${swOuter}" ${strokeAttrs}/>
                        </mask>
                        <mask id="${topMaskId}">
                            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                            <polyline points="${innerStrokePts}" fill="none" stroke="black" stroke-width="${swInner}" ${strokeAttrs}/>
                            <line x1="${pAp.x}" y1="${pAp.y}" x2="${psB.x}" y2="${psB.y}" stroke="black" stroke-width="${swInner}" stroke-linecap="round"/>
                            <polygon points="${outerOutline}" fill="none" stroke="black" stroke-width="${swOuter}" ${strokeAttrs}/>
                        </mask>
                    </defs>
                    <polygon class="sticker" id="${piece} left"  points="${leftPts}" fill="${leftColor}" mask="url(#${leftMaskId})"/>
                    <polygon class="sticker" id="${piece} right" points="${rightPts}" fill="${rightColor}" mask="url(#${rightMaskId})"/>
                    <polygon class="sticker" id="${piece} top"   points="${topPts}" fill="${topColor}" mask="url(#${topMaskId})"/>
                    <polyline points="${innerStrokePts}" fill="none" stroke="${col}" stroke-width="${swInner}" ${strokeAttrs}/>
                    <line x1="${pAp.x}" y1="${pAp.y}" x2="${psB.x}" y2="${psB.y}" stroke="${col}" stroke-width="${swInner}" stroke-linecap="round"/>
                    <polygon points="${outerOutline}" fill="none" stroke="${col}" stroke-width="${swOuter}" ${strokeAttrs}/>
                `;
            },

            drawSlice(layer, cx, cy, size, colors, muted, ph = DEFAULT_PLACEHOLDER, settings = {}) {
                const rOuter = size * 0.4 * 0.7;
                const ringR = rOuter + size * 0.4 * 0.4;
                const r = ringR * 1.20;
                const sw = (size * (settings.sliceStrokeWidth ?? 0.008)).toFixed(2);
                const color = muted ? ph.slice : (colors['slice-indicator'] ?? '#6f0000');
                function polarPt(r, deg) {
                    const rad = (deg - 90) * Math.PI / 180;
                    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
                }
                const [a1, a2] = layer === 'top' ? [15, 195] : [-15, 165];
                const p1 = polarPt(r, a1), p2 = polarPt(r, a2);
                return `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" stroke="${color}" stroke-width="${sw}"/>`;
            },
        },

        withoutSideColor: {
            layerScale: 1.64,
            colorSlots: [
                { id: 'top', label: 'Top', default: 'rgba(71,71,71,1)' },
                { id: 'bottom', label: 'Bottom', default: '#FFFFFF' },
                { id: 'border', label: 'Border', default: 'rgba(0,0,0,1)' },
                { id: 'slice-indicator', label: 'Slice Indicator', default: 'rgba(111,0,0,1)' },
            ],

            drawEdge(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {
                let innerColor = resolveColor(edgeColors[piece].inner, colors);
                if (muted) {
                    const def = defaultPieceColors().edgeColors[piece];
                    if (innerColor === colors[def.inner]) innerColor = ph.sticker;
                }
                const rOuter = size * 0.4 * 0.7, half = 15;
                function pt(r, deg) {
                    const rad = deg * Math.PI / 180;
                    return { x: +(r * Math.sin(rad)).toFixed(2), y: +(-r * Math.cos(rad)).toFixed(2) };
                }
                function ps(pts) { return pts.map(p => `${p.x},${p.y}`).join(' '); }
                const pi = { x: 0, y: 0 };
                const pA = pt(rOuter, -half), pB = pt(rOuter, half);
                const sw = (size * 0.004).toFixed(2);
                return `<polygon class="sticker" id="${piece} inner" points="${ps([pi, pA, pB])}" fill="${innerColor}" stroke="${muted ? ph.border : colors.border}" stroke-width="${sw}"/>`;
            },

            drawCorner(piece, colors, size, muted, ph = DEFAULT_PLACEHOLDER) {
                let topColor = resolveColor(cornerColors[piece].top, colors);
                if (muted) {
                    const def = defaultPieceColors().cornerColors[piece];
                    if (topColor === colors[def.top]) topColor = ph.sticker;
                }
                const rOuter = size * 0.4 * 0.7;
                const rApex = rOuter * 1.366025404;
                const half = 30;
                function pt(r, deg) {
                    const rad = deg * Math.PI / 180;
                    return { x: +(r * Math.sin(rad)).toFixed(2), y: +(-r * Math.cos(rad)).toFixed(2) };
                }
                function ps(pts) { return pts.map(p => `${p.x},${p.y}`).join(' '); }
                const pi = { x: 0, y: 0 };
                const pOR = pt(rOuter, -half), pAp = pt(rApex, 0), pOL = pt(rOuter, half);
                const sw = (size * 0.004).toFixed(2);
                return `<polygon class="sticker" id="${piece} top" points="${ps([pi, pOR, pAp, pOL])}" fill="${topColor}" stroke="${muted ? ph.border : colors.border}" stroke-width="${sw}"/>`;
            },

            drawSlice(layer, cx, cy, size, colors, muted, ph = DEFAULT_PLACEHOLDER, settings = {}) {
                // Reuse withSideColor — same visual, same angles
                return AbidStyle.withSideColor.drawSlice(layer, cx, cy, size, colors, muted, ph, settings);
            },
        },
    };

    // =====================================================================
    // === STYLE REGISTRY ==================================================
    // =====================================================================

    const STYLES = [SAC2Style, AbidStyle];

    // =====================================================================
    // === ACTIVE STYLE STATE ==============================================
    // =====================================================================

    const defaultStyleIndex = STYLES.findIndex(style => style.source === 'Abid');
    let activeStyleIndex = defaultStyleIndex === -1 ? 0 : defaultStyleIndex;
    let showSideColors = true;
    const styleControlOverrides = new Map();

    function getActiveVariant() {
        const style = STYLES[activeStyleIndex];
        return activeVariantUsesSideColors() ? style.withSideColor : style.withoutSideColor;
    }

    function getPlaceholderScheme() {
        return STYLES[activeStyleIndex]?.placeholderScheme ?? DEFAULT_PLACEHOLDER;
    }

    // ── Color overrides ──────────────────────────────────────────────────
    // Keyed by `${styleSource}_${with|without}` → { colorId: hexString }
    const colorOverrides = new Map();

    function variantKey(source, withSides) {
        return `${source}_${withSides ? 'with' : 'without'}`;
    }

    function getResolvedColors() {
        const style = STYLES[activeStyleIndex];
        const variant = getActiveVariant();
        const key = variantKey(style.source, activeVariantUsesSideColors());
        const overrides = colorOverrides.get(key) || {};
        const colors = {};
        for (const slot of variant.colorSlots) {
            colors[slot.id] = overrides[slot.id] ?? slot.default;
        }
        return colors;
    }

    function setColorOverride(slotId, hex) {
        const style = STYLES[activeStyleIndex];
        const key = variantKey(style.source, activeVariantUsesSideColors());
        if (!colorOverrides.has(key)) colorOverrides.set(key, {});
        colorOverrides.get(key)[slotId] = hex;
    }



    // =====================================================================
    // === HEX PARSING & RENDERING =========================================
    // =====================================================================

    function slotCentreAngle(pos, span) {
        return (pos - 1) * 30 + (span * 30) / 2;
    }

    function parseHex(rawHex) {
        const hex = rawHex.replace(/[|/]/, '');
        function parseLayer(chars) {
            const tokens = [];
            let slotPos = 1, i = 0;
            while (i < chars.length) {
                const ch = chars[i].toLowerCase();
                if (CORNER_HEX_VALUES.includes(ch)) {
                    tokens.push({ piece: ch, type: 'corner', position: slotPos });
                    slotPos += 2; i += 2;
                } else {
                    tokens.push({ piece: ch, type: 'edge', position: slotPos });
                    slotPos += 1; i += 1;
                }
            }
            return tokens;
        }
        return { top: parseLayer(hex.slice(0, 12)), bottom: parseLayer(hex.slice(12, 24)) };
    }

    function drawLayer(tokens, isBottom, cx, cy, size, muted) {
        const variant = getActiveVariant();
        const colors = getResolvedColors();
        const ph = getPlaceholderScheme();
        const settings = getActiveStyleSettings();
        const layerScale = variant.layerScale ?? 1;
        let svg = '';
        for (const token of tokens) {
            const span = token.type === 'corner' ? 2 : 1;
            const layerOffset = isBottom ? -195 : 15;
            const angle = -slotCentreAngle(token.position, span) + layerOffset;
            const pieceInner = token.type === 'edge'
                ? variant.drawEdge(token.piece, colors, size, muted, ph, settings)
                : variant.drawCorner(token.piece, colors, size, muted, ph, settings);
            const transform = `translate(${cx},${cy}) rotate(${angle.toFixed(2)})`;
            svg += `<g class="sq1-piece" transform="${transform}">${pieceInner}</g>`;
        }
        if (layerScale !== 1) {
            svg = `<g class="sq1-pieces" transform="translate(${cx},${cy}) scale(${layerScale}) translate(${-cx},${-cy})">${svg}</g>`;
        } else {
            svg = `<g class="sq1-pieces">${svg}</g>`;
        }
        return svg;
    }

    function getAbidPieceOcclusion(token, isBottom, cx, cy, size, settings) {
        const span = token.type === 'corner' ? 2 : 1;
        const layerOffset = isBottom ? -195 : 15;
        const angle = -slotCentreAngle(token.position, span) + layerOffset;
        const rOuter = size * 0.4 * 0.7;

        function pt(r, deg) {
            const rad = deg * Math.PI / 180;
            return { x: +(r * Math.sin(rad)).toFixed(2), y: +(-r * Math.cos(rad)).toFixed(2) };
        }
        function ps(pts) { return pts.map(p => `${p.x},${p.y}`).join(' '); }

        const pi = { x: 0, y: 0 };
        let shape;
        if (token.type === 'edge') {
            const half = 15;
            const pA = pt(rOuter, -half), pB = pt(rOuter, half);
            shape = `<polygon points="${ps([pi, pA, pB])}" fill="black"/>`;
        } else {
            const half = 30;
            const rApex = rOuter * 1.366025404;
            const pOR = pt(rOuter, -half), pAp = pt(rApex, 0), pOL = pt(rOuter, half);
            shape = `<polygon points="${ps([pi, pOL, pAp, pOR])}" fill="black"/>`;
        }

        return `<g transform="translate(${cx},${cy}) rotate(${angle.toFixed(2)})">${shape}</g>`;
    }

    function getLayerSliceMask(tokens, isBottom, cx, cy, size, maskId) {
        const style = STYLES[activeStyleIndex];
        if (style.source !== 'Abid') return '';

        const variant = getActiveVariant();
        const settings = getActiveStyleSettings();
        const layerScale = variant.layerScale ?? 1;
        let occlusion = tokens.map(token => getAbidPieceOcclusion(token, isBottom, cx, cy, size, settings)).join('');
        if (layerScale !== 1) {
            occlusion = `<g transform="translate(${cx},${cy}) scale(${layerScale}) translate(${-cx},${-cy})">${occlusion}</g>`;
        }

        return `
            <defs>
                <mask id="${maskId}">
                    <rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>
                    ${occlusion}
                </mask>
            </defs>
        `;
    }

    function drawSliceWithLayerMask(layer, tokens, isBottom, cx, cy, size, colors, muted) {
        const style = STYLES[activeStyleIndex];
        const variant = getActiveVariant();
        const settings = getActiveStyleSettings();
        const slice = style.source === 'Abid'
            ? variant.drawSlice(layer, cx, cy, size, colors, muted, getPlaceholderScheme(), settings)
            : variant.drawSlice(layer, cx, cy, size, colors, muted, getPlaceholderScheme());
        const maskId = `mask-abid-slice-${layer}-${Math.random().toString(36).slice(2)}`;
        const maskDef = getLayerSliceMask(tokens, isBottom, cx, cy, size, maskId);
        if (!maskDef) return slice;
        return `${maskDef}<g mask="url(#${maskId})">${slice}</g>`;
    }

    // =====================================================================
    // === MAIN SVG BUILDER ================================================
    // =====================================================================

    function getSingleLayerSVG(rawHex, size = 400, muted, showSlice, whichLayer = 'top', exportPad = 0) {
        const hex = rawHex.replace(/[|/]/, '');
        if (hex.length !== 24) throw new Error('Hex must be 24 data characters.');
        const parsed = parseHex(rawHex);
        const variant = getActiveVariant();
        const colors = getResolvedColors();
        const settings = getActiveStyleSettings();
        size = size * (220 / 400);
        const cx = size / 2, cy = size / 2;
        const isBottom = whichLayer === 'bottom';
        const tokens = isBottom ? parsed.bottom : parsed.top;
        let content = '';
        if (showSlice) content += drawSliceWithLayerMask(whichLayer, tokens, isBottom, cx, cy, size, colors, muted);
        content += drawLayer(tokens, isBottom, cx, cy, size, muted);
        // Tight viewBox: content is centred at cx,cy, radius ~= size*0.5
        const r = size * 0.52 + exportPad;
        const vbX = (cx - r).toFixed(2), vbY = (cy - r).toFixed(2);
        const vbS = (r * 2).toFixed(2);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${vbS}" height="${vbS}" viewBox="${vbX} ${vbY} ${vbS} ${vbS}" data-origin-x="${cx}" data-origin-y="${cy}" data-puzzle-size="${size}" style="overflow:visible;" class="squan">${content}</svg>`;
    }

    function getSVG(rawHex, size = 400, ringDistance = 16, muted, isVert, showSlice, _showSides, exportPad = 0) {
        // _showSides is ignored — controlled via setShowSideColors()
        const hex = rawHex.replace(/[|/]/, '');
        if (hex.length !== 24) throw new Error('Hex must be 24 data characters (plus optional | separator).');

        const parsed = parseHex(rawHex);
        const variant = getActiveVariant();
        const colors = getResolvedColors();
        const settings = getActiveStyleSettings();

        size = size * (220 / 400);
        const cx = size / 2, cy = size / 2;
        const margin = size * (0.44 * (2 + ringDistance / 100) - 1);

        const topApexY = cy - (123.5 / 220) * size;
        const padTop = exportPad + Math.max(0, Math.ceil(-topApexY + (122 / 220) * size * 0.05));
        const padOther = exportPad;
        const vbX = -padOther, vbY = -padTop;
        const vbW = size + padOther * 2, vbH = size + padTop + padOther;

        const dir = isVert ? 'flex-direction:column;' : 'flex-direction:row;';
        let html = `<div style="display:flex;align-items:center;overflow:visible;padding:2rem;${dir}">`;

        const svgAttrs = `width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" data-origin-x="${cx}" data-origin-y="${cy}" data-puzzle-size="${size}" style="overflow:visible;" class="squan"`;
        const gap = isVert ? `margin-top:${margin.toFixed(1)}px;` : `margin-left:${margin.toFixed(1)}px;`;

        html += `<svg ${svgAttrs}>`;
        if (showSlice) html += drawSliceWithLayerMask('top', parsed.top, false, cx, cy, size, colors, muted);
        html += drawLayer(parsed.top, false, cx, cy, size, muted);
        html += `</svg>`;

        html += `<svg ${svgAttrs.replace('style="overflow:visible;"', `style="overflow:visible;${gap}"`)}>`;
        if (showSlice) html += drawSliceWithLayerMask('bottom', parsed.bottom, true, cx, cy, size, colors, muted);
        html += drawLayer(parsed.bottom, true, cx, cy, size, muted);
        html += `</svg></div>`;

        return html;
    }

    function getPiecesColors() { return { edgeColors, cornerColors, sliceColors }; }
    function setPiecesColors(pc) { edgeColors = pc.edgeColors; cornerColors = pc.cornerColors; if (pc.sliceColors) sliceColors = pc.sliceColors; }

    // =====================================================================
    // === PUBLIC API ======================================================
    // =====================================================================

    return {
        // Core rendering
        getSVG, getSingleLayerSVG, parseHex,
        // Color scheme
        getColorSlots() { return getActiveVariant().colorSlots; },
        getColorScheme() { return getResolvedColors(); },
        setColorScheme(partial) { for (const [id, hex] of Object.entries(partial)) setColorOverride(id, hex); },
        // Style system
        getStyles() { return STYLES.map((s, i) => ({ name: s.name, source: s.source, index: i })); },
        getActiveStyleIndex() { return activeStyleIndex; },
        setActiveStyle(i) {
            activeStyleIndex = i;
            if (!STYLES[activeStyleIndex].hidableSideColor) showSideColors = true;
        },
        getActiveStyle() { return STYLES[activeStyleIndex]; },
        setShowSideColors(v) { showSideColors = STYLES[activeStyleIndex].hidableSideColor ? v : true; },
        getShowSideColors() { return activeVariantUsesSideColors(); },
        getStyleControls() { return STYLES[activeStyleIndex].controls ?? []; },
        getStyleSettings() { return getActiveStyleSettings(); },
        setStyleSettings(partial) {
            const style = STYLES[activeStyleIndex];
            if (!styleControlOverrides.has(style.source)) styleControlOverrides.set(style.source, {});
            Object.assign(styleControlOverrides.get(style.source), partial);
        },
        // Piece color config
        getPiecesColors, setPiecesColors,
        createDefaultPieceColors: defaultPieceColors,
    };

}

export const sq1core = createSquare1Core();

function createConfiguredCore(options = {}) {
    const core = createSquare1Core({ piecesColors: options.piecesColors });
    if (options.styleIndex != null) core.setActiveStyle(options.styleIndex);
    if (options.showSideColors != null) core.setShowSideColors(options.showSideColors);
    if (options.styleSettings) core.setStyleSettings(options.styleSettings);
    if (options.colorScheme) core.setColorScheme(options.colorScheme);
    return core;
}

export function renderSquare1SVG(rawHex, options = {}) {
    const core = createConfiguredCore(options);
    return core.getSVG(
        rawHex,
        options.size ?? 400,
        options.ringDistance ?? 16,
        options.muted ?? false,
        options.isVertical ?? false,
        options.showSlice ?? true,
        options.showSideColors ?? true,
        options.exportPad ?? 0,
    );
}

export function renderSquare1LayerSVG(rawHex, options = {}) {
    const core = createConfiguredCore(options);
    return core.getSingleLayerSVG(
        rawHex,
        options.size ?? 400,
        options.muted ?? false,
        options.showSlice ?? true,
        options.layer ?? 'top',
        options.exportPad ?? 0,
    );
}
