import { algToShapeIndex } from '../lib/cube';
import { CSPData } from '../lib/dataStore';
import { traceSolutionToSolutionShapePath } from '../lib/shapeTrace';

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Helper to sanitize note HTML (allow various text formatting tags). */
export function sanitizeNoteHTML(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html;

  const temp = document.createElement('div');
  temp.innerHTML = html;

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();
    const childText = Array.from(el.childNodes).map(processNode).join('');

    if (['b', 'strong'].includes(tagName)) return `<b>${childText}</b>`;
    if (tagName === 'u') return `<u>${childText}</u>`;
    if (['i', 'em'].includes(tagName)) return `<i>${childText}</i>`;
    if (['s', 'strike', 'del'].includes(tagName)) return `<s>${childText}</s>`;
    if (tagName === 'sub') return `<sub>${childText}</sub>`;
    if (tagName === 'sup') return `<sup>${childText}</sup>`;
    if (tagName === 'big') return `<big>${childText}</big>`;
    if (tagName === 'small') return `<small>${childText}</small>`;
    if (tagName === 'br') return '<br>';
    if (tagName === 'font') {
      const color = el.getAttribute('color') || '';
      const safeColor = color.match(/^(#[0-9A-Fa-f]{3,6}|[a-zA-Z]+)$/) ? color : '';
      if (safeColor) return `<font color="${safeColor}">${childText}</font>`;
      return childText;
    }
    if (tagName === 'span') {
      const style = el.getAttribute('style') || '';
      const colorMatch = style.match(/color:\s*([#a-zA-Z0-9]+)/);
      if (colorMatch) {
        const safeColor = colorMatch[1].match(/^(#[0-9A-Fa-f]{3,6}|[a-zA-Z]+)$/)
          ? colorMatch[1]
          : '';
        if (safeColor) return `<span style="color: ${safeColor}">${childText}</span>`;
      }
      return childText;
    }
    if (tagName === 'a') {
      const href = el.getAttribute('href') || '';
      const safeHref = href.startsWith('javascript:') ? '' : href;
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${childText}</a>`;
    }
    return childText;
  };

  return Array.from(temp.childNodes).map(processNode).join('');
}

export function stripParenthesisIfNeeded(algo: string): string {
  if (!algo || typeof algo !== 'string') return algo;
  return algo.replace(/\(/g, ' ').replace(/\)/g, ' ');
}

export function wrapAlgorithmTokens(algo: string, hideParenthesis: boolean): string {
  if (!algo || typeof algo !== 'string') return algo;

  let result = algo;
  if (hideParenthesis) {
    result = result.replace(/\(/g, ' ').replace(/\)/g, ' ');
    return result.replace(/([-]?\d+,[-]?\d+)/g, '<span style="white-space: nowrap;">$1</span>');
  }

  return result.replace(/(\([^)]+\))/g, '<span style="white-space: nowrap;">$1</span>');
}

export function styleAlgorithmWithGrayMoves(
  algo: string,
  hideParenthesis: boolean,
): string {
  if (!algo || typeof algo !== 'string' || algo === 'Done!') return algo;

  const parts = algo.split('/');
  if (parts.length <= 1) {
    return wrapAlgorithmTokens(algo, hideParenthesis);
  }

  const startsWithSlash = parts[0].trim() === '';
  const endsWithSlash = parts[parts.length - 1].trim() === '';

  const styledParts = parts.map((part, idx) => {
    if (part.trim() === '') return part;
    if (idx === 0 && !startsWithSlash) {
      return `<span style="color: var(--algo-setup-color);">${wrapAlgorithmTokens(
        part,
        hideParenthesis,
      )}</span>`;
    }
    if (idx === parts.length - 1 && !endsWithSlash) {
      return `<span style="color: var(--text-muted);">${wrapAlgorithmTokens(
        part,
        hideParenthesis,
      )}</span>`;
    }
    return wrapAlgorithmTokens(part, hideParenthesis);
  });

  return styledParts.join('/');
}

export interface AlgDisplayMeta {
  invalid: boolean;
  mirrored: boolean;
}

const metaCache = new Map<string, AlgDisplayMeta>();

export function getAlgDisplayMeta(alg: string, caseName: string): AlgDisplayMeta {
  const key = `${caseName}|${alg}`;
  let meta = metaCache.get(key);
  if (!meta) {
    meta = computeAlgDisplayMeta(alg, caseName);
    metaCache.set(key, meta);
  }
  return meta;
}

function computeAlgDisplayMeta(alg: string, caseName: string): AlgDisplayMeta {
  if (!alg || alg === 'Done!') {
    return { invalid: false, mirrored: false };
  }
  try {
    const canonicalIdx = CSPData.getCanonicalShapeIndex(caseName);
    if (canonicalIdx === null) return { invalid: false, mirrored: false };

    const caseShapeData = CSPData.getShapeEntry(caseName);

    const result = algToShapeIndex(alg);
    const idx = result.shapeIndex;

    const isDirectMatch = idx === canonicalIdx;
    const isInOrg = caseShapeData && caseShapeData.org && caseShapeData.org.includes(idx);
    const isInMir = caseShapeData && caseShapeData.mir && caseShapeData.mir.includes(idx);

    if (isDirectMatch || isInOrg) return { invalid: false, mirrored: false };
    if (isInMir) return { invalid: false, mirrored: true };
    return { invalid: true, mirrored: false };
  } catch {
    return { invalid: true, mirrored: false };
  }
}

export interface ShapePathStep {
  top: string;
  bottom: string;
}

export function getShapePath(scramble: string): ShapePathStep[] | null {
  if (!scramble || scramble.trim() === '' || scramble === 'Done!') {
    return null;
  }
  try {
    const shapePathString = traceSolutionToSolutionShapePath(scramble);
    if (shapePathString) {
      const steps = shapePathString.split(' → ').map((s) => s.trim());
      return steps.map((step) => {
        const [top, bottom] = step.split('/').map((s) => s.trim());
        return { top, bottom };
      });
    }
  } catch (err) {
    console.error('Error generating shape path:', err);
  }
  return null;
}

export function renderShapePath(path: ShapePathStep[] | null): string {
  if (!path || path.length === 0) return '';

  const pathSteps = path
    .map((step, idx) => {
      const arrow = idx < path.length - 1 ? ' <span class="shape-path-arrow">→</span> ' : '';
      return `<span class="shape-path-step">${step.top}/${step.bottom}</span>${arrow}`;
    })
    .join('');

  return `
        <div class="shape-path-block">
            <div class="shape-path-label">Shape Path:</div>
            <div style="font-size: 0.9rem; line-height: 1.8; overflow-x: auto; white-space: nowrap;">
                ${pathSteps}
            </div>
        </div>
    `;
}

export function renderAlgorithm(algoArray: string[], hideParenthesis: boolean): string {
  return algoArray
    .map((algo) => `<div class="algo-line">${styleAlgorithmWithGrayMoves(algo, hideParenthesis)}</div>`)
    .join('');
}

export function renderAlgorithmWithPopup(
  algoArray: string[],
  caseName: string,
  parityType: string,
  hideParenthesis: boolean,
  fontFamily: string,
  validateMeta = true,
  markMirrored = false,
): string {
  const fontStyle = fontFamily ? `font-family: ${fontFamily};` : '';
  return algoArray
    .map((algo, idx) => {
      const algoId = `alg-${caseName.replace(/[^a-zA-Z0-9]/g, '_')}-${parityType}-${idx}`;
      const full = validateMeta || markMirrored ? getAlgDisplayMeta(algo, caseName) : null;
      const meta = {
        invalid: validateMeta && !!full?.invalid,
        mirrored: !!full?.mirrored,
      };
      const prefix = meta.mirrored ? '<span class="z2-prefix">z2</span>' : '';
      const colorStyle = meta.invalid ? 'color: var(--algo-invalid-color);' : '';
      const wrapStyle = meta.invalid
        ? 'display: flex; align-items: baseline; flex-wrap: wrap; opacity: 0.18;'
        : 'display: flex; align-items: baseline; flex-wrap: wrap;';
      return `<div class="algo-line algo-interactive"
                     id="${algoId}"
                     data-algo="${algo.replace(/"/g, '&quot;')}"
                     data-case="${caseName.replace(/"/g, '&quot;')}"
                     data-parity="${parityType}"
                     onmouseenter="showAlgoPopup(this, '${algo.replace(/'/g, "\\'")}', false)"
                     onmouseleave="hideAlgoPopup(this, false)"
                     onclick="event.stopPropagation(); showAlgoPopup(this, '${algo.replace(/'/g, "\\'")}', true)"
                     style="${wrapStyle} ${colorStyle} ${fontStyle}">${prefix}${styleAlgorithmWithGrayMoves(
                       algo,
                       hideParenthesis,
                     )}</div>`;
    })
    .join('');
}
