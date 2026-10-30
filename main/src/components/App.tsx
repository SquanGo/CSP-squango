import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAppStore } from '../app/store';
import {
  applyPreset,
  calculateAndCacheAllParityChunked,
  calculateAndCacheParityForCases,
  currentSortMode,
  currentPreset,
  hydratePresetDetails,
  hydrateSavedStateDetails,
  initializePreset,
  initializeSVGDataForCases,
  isFirstLoad,
  needsParityRecalculation,
  profileAvatar,
  setNeedsReorder,
  setSortMode,
  updateProgress,
  type SortMode,
} from '../app/state';
import { computeFilteredData, type LearnFilter } from '../app/filter';
import { installWindowShims } from '../app/shims';
import { renderCard } from '../app/cardHTML';
import { reconcileGrid } from '../app/gridRender';
import { getCaseId } from '../data/cases';
import { openGeneralNotesModal } from '../app/notes';
import { applyInstructionVisibility } from '../app/visibility';
// LoadingScreen intentionally disabled: the app now paints the shell first and
// uses inline skeleton cards while the heavier boot work runs after first paint.
// import LoadingScreen from './LoadingScreen';
import SettingsModal from './SettingsModal';
import HomepageImagesModal from './HomepageImagesModal';
import Dropdown from './Dropdown';
import { decorateLearningOrderGrid } from '../app/learningOrder';
import { CSP_CACHE_KEY, readCspObject, updateCspObject } from '../lib/storage';
import { temporarilyDisablePointerEvents } from '../app/interactionLock';

const DEFAULT_SKELETON_CARD_HEIGHT = 360;
const MATT_SKELETON_CARD_HEIGHT = 430;
const MIN_INITIAL_CARD_COUNT = 3;
const MAX_INITIAL_CARD_COUNT = 18;
type ScheduledHandle = { cancel: () => void };

function readCardHeightCache(): Record<string, number> {
  try {
    const cache = readCspObject(CSP_CACHE_KEY);
    return (cache.cardHeightEstimates as Record<string, number> | undefined) || {};
  } catch {
    return {};
  }
}

function getGridColumnCount(grid: HTMLElement): number {
  const columns = window.getComputedStyle(grid).gridTemplateColumns;
  if (!columns || columns === 'none') return 1;
  return columns.split(' ').filter(Boolean).length || 1;
}

function getCardHeightCacheKey(preset: string, columns: number): string {
  return `${preset || 'unknown'}::${columns}`;
}

function getCachedCardHeight(preset: string, columns: number): number {
  const cached = readCardHeightCache()[getCardHeightCacheKey(preset, columns)];
  if (typeof cached === 'number' && Number.isFinite(cached) && cached > 0) return cached;
  return preset === "Matt's_Preset" ? MATT_SKELETON_CARD_HEIGHT : DEFAULT_SKELETON_CARD_HEIGHT;
}

function saveCardHeightEstimate(preset: string, columns: number, height: number): void {
  if (!Number.isFinite(height) || height <= 0) return;
  const cache = readCardHeightCache();
  const key = getCardHeightCacheKey(preset, columns);
  const previous = cache[key];
  // Ease downward so a temporarily short filtered view does not make the next
  // Matt/default skeleton too small again.
  cache[key] = previous ? Math.round(previous * 0.35 + height * 0.65) : Math.round(height);
  updateCspObject(CSP_CACHE_KEY, { cardHeightEstimates: cache });
}

function getInitialCardCount(columns: number, estimatedCardHeight: number): number {
  const controlsReserve = 190;
  const visibleRows = Math.ceil(Math.max(1, window.innerHeight - controlsReserve) / estimatedCardHeight);
  const rowsToRender = Math.max(2, visibleRows + 1);
  return Math.min(MAX_INITIAL_CARD_COUNT, Math.max(MIN_INITIAL_CARD_COUNT, columns * rowsToRender));
}

function scheduleBackgroundTask(callback: () => void, timeout = 500): ScheduledHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(callback, { timeout });
    return { cancel: () => w.cancelIdleCallback?.(id) };
  }
  const id = window.setTimeout(callback, 32);
  return { cancel: () => window.clearTimeout(id) };
}

function scheduleGridChunk(callback: () => void): ScheduledHandle {
  return scheduleBackgroundTask(callback, 250);
}

function updateSelectLabels(): void {
  const width = window.innerWidth;
  document.querySelectorAll('select').forEach((select) => {
    select.querySelectorAll('option').forEach((option) => {
      if (!option.getAttribute('data-full')) {
        option.setAttribute('data-full', option.textContent || '');
      }
      const fullText = option.getAttribute('data-full') || '';
      const shortText = option.getAttribute('data-short') || '';
      const xsText = option.getAttribute('data-xs') || '';
      if (width <= 400 && xsText) {
        option.textContent = xsText;
      } else if (width <= 570 && shortText) {
        option.textContent = shortText;
      } else {
        option.textContent = fullText;
      }
    });
  });
}

export default function App(): React.ReactNode {
  const storeVersion = useAppStore();
  const [bootReady, setBootReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortType, setSortTypeState] = useState<SortMode>(currentSortMode);
  const [learnFilter, setLearnFilterState] = useState<LearnFilter>('all');
  const [skeletonCardHeight, setSkeletonCardHeight] = useState(MATT_SKELETON_CARD_HEIGHT);
  const [initialCardCount, setInitialCardCount] = useState(MIN_INITIAL_CARD_COUNT);
  const [gridComplete, setGridComplete] = useState(false);
  const [gridRenderTick, setGridRenderTick] = useState(0);
  const [showReorderButton, setShowReorderButton] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const gridPaintedRef = useRef(false);
  const parityStartedRef = useRef(false);

  const setSortType = useCallback((mode: SortMode) => {
    setSortTypeState(mode);
    setSortMode(mode);
  }, []);

  const setLearnFilter = useCallback((filter: LearnFilter) => {
    setLearnFilterState(filter);
  }, []);

  useEffect(() => {
    setSortTypeState(currentSortMode);
  }, [storeVersion]);

  const filtered = useMemo(
    () => (bootReady ? computeFilteredData(searchTerm, sortType, learnFilter) : []),
    [searchTerm, sortType, learnFilter, bootReady, storeVersion],
  );

  const gridHTML = useMemo(
    () => (bootReady ? filtered.slice(0, initialCardCount).map((item) => renderCard(item)).join('') : ''),
    [filtered, bootReady, initialCardCount, storeVersion],
  );

  const reorderExistingGrid = useCallback((items: ReturnType<typeof computeFilteredData>) => {
    const grid = gridRef.current;
    if (!grid) return;
    // Learning/priority edits already refresh the affected card. Move only the
    // nodes whose position changed, keeping all SVG descendants connected.
    reconcileGrid(grid, items, false);
    setGridRenderTick((tick) => tick + 1);
  }, []);

  // Boot: paint the responsive shell first, then run preset/SVG/parity work.
  useEffect(() => {
    if (isFirstLoad) temporarilyDisablePointerEvents();
    let cancelled = false;
    let hydrationHandle: ScheduledHandle | null = null;
    const afterFirstPaint = () => {
      window.setTimeout(() => {
        void (async () => {
          installWindowShims();
          if (!isFirstLoad) void initializePreset();
          if (cancelled) return;
          const columns = gridRef.current ? getGridColumnCount(gridRef.current) : 1;
          const estimatedCardHeight = getCachedCardHeight(currentPreset, columns);
          setSkeletonCardHeight(estimatedCardHeight);
          const initialCount = getInitialCardCount(columns, estimatedCardHeight);
          setInitialCardCount(initialCount);
          if (isFirstLoad) await applyPreset("Matt's_Preset", true, true, true, true, true);
          if (cancelled) return;
          const initialCases = computeFilteredData(searchTerm, sortType, learnFilter).slice(0, initialCount);
          if (needsParityRecalculation()) calculateAndCacheParityForCases(initialCases);
          initializeSVGDataForCases(initialCases);
          if (cancelled) return;
          setBootReady(true);
          applyInstructionVisibility();
          updateProgress();
          if (isFirstLoad) {
            hydrationHandle = scheduleBackgroundTask(() => {
              void hydratePresetDetails("Matt's_Preset").then(() => {
                if (!cancelled) openGeneralNotesModal();
              });
            }, 1000);
          } else {
            hydrationHandle = scheduleBackgroundTask(() => {
              if (!cancelled) hydrateSavedStateDetails();
            }, 1000);
          }
        })();
      }, 0);
    };
    const frame = window.requestAnimationFrame(afterFirstPaint);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      hydrationHandle?.cancel();
    };
  }, []);

  useEffect(() => {
    updateSelectLabels();
    window.addEventListener('resize', updateSelectLabels);
    return () => window.removeEventListener('resize', updateSelectLabels);
  }, []);

  useEffect(() => {
    // Show the button only if a re-sort would change the displayed order.
    
    const onShowReorder = () => {
      const grid = gridRef.current;
      let differs = true;
      if (grid) {
        const current = Array.from(grid.querySelectorAll<HTMLElement>('.card')).map((card) =>
          getCaseId(card.dataset.caseName || ''),
        );
        const expected = computeFilteredData(searchTerm, sortType, learnFilter).map((item) => item.id);
        // Compare only the rendered prefix; the grid fills in progressively.
        differs = current.some((id, i) => id !== expected[i]);
      }
      setNeedsReorder(differs, false);
      setShowReorderButton(differs);
    };
    const onPresetLoaded = () => setShowReorderButton(false);
    window.addEventListener('sqg:show-reorder', onShowReorder);
    window.addEventListener('sqg:preset-loaded', onPresetLoaded);
    return () => {
      window.removeEventListener('sqg:show-reorder', onShowReorder);
      window.removeEventListener('sqg:preset-loaded', onPresetLoaded);
    };
  }, [searchTerm, sortType, learnFilter]);

  // Search toggle behavior
  const searchToggleRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const searchToggle = searchToggleRef.current;
    const searchInput = searchRef.current;
    if (!controls || !searchToggle || !searchInput) return;

    const onSearchToggleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isExpanded = controls.classList.toggle('search-expanded');
      if (isExpanded) {
        setTimeout(() => searchInput.focus(), 100);
      } else {
        searchInput.blur();
      }
    };

    const onDocClick = (e: MouseEvent) => {
      if (
        controls.classList.contains('search-expanded') &&
        !controls.contains(e.target as Node) &&
        !searchToggle.contains(e.target as Node)
      ) {
        controls.classList.remove('search-expanded');
        searchInput.blur();
      }
    };

    const onSearchKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        controls.classList.remove('search-expanded');
        searchInput.blur();
      }
    };

    searchToggle.addEventListener('mousedown', onSearchToggleMouseDown);
    document.addEventListener('click', onDocClick);
    searchInput.addEventListener('keydown', onSearchKeydown);
    return () => {
      searchToggle.removeEventListener('mousedown', onSearchToggleMouseDown);
      document.removeEventListener('click', onDocClick);
      searchInput.removeEventListener('keydown', onSearchKeydown);
    };
  }, []);

  // Update progress bars whenever learned state changes
  useEffect(() => {
    if (bootReady) updateProgress();
  }, [bootReady, storeVersion]);

  useEffect(() => {
    if (!bootReady || !gridRef.current) return;
    decorateLearningOrderGrid(gridRef.current, '.card', 'data-case-name', sortType);
  }, [bootReady, filtered, gridRenderTick, storeVersion, sortType]);

  useEffect(() => {
    if (!bootReady || !gridRef.current) return;

    const grid = gridRef.current;
    const items = filtered;

    setGridComplete(false);

    // After the first paint, reconcile the grid in place. This reuses existing
    // card DOM nodes, so re-sorts/re-filters/toggles don't tear the list down
    // (which collapses the document height, jumps the scroll to the top, and
    // streams the rest of the cards back in).
    if (gridPaintedRef.current) {
      initializeSVGDataForCases(items);
      if (needsParityRecalculation()) calculateAndCacheParityForCases(items);
      reconcileGrid(grid, items);
      updateProgress();
      applyInstructionVisibility();
      setGridComplete(true);
      setGridRenderTick((tick) => tick + 1);
      return;
    }

    // First paint: fill the grid progressively so the initial render stays
    // non-blocking, ensuring SVG data per chunk as before.
    gridPaintedRef.current = true;
    grid.innerHTML = gridHTML;

    if (items.length <= initialCardCount) {
      setGridComplete(true);
      setGridRenderTick((tick) => tick + 1);
      return;
    }

    const columns = getGridColumnCount(grid);
    const chunkSize = Math.max(columns * 2, 6);
    let nextIndex = initialCardCount;
    let cancelled = false;
    let scheduledHandle: ScheduledHandle | null = null;

    const appendChunk = () => {
      if (cancelled || !gridRef.current) return;
      const end = Math.min(items.length, nextIndex + chunkSize);
      const nextItems = items.slice(nextIndex, end);
      if (needsParityRecalculation()) calculateAndCacheParityForCases(nextItems);
      initializeSVGDataForCases(nextItems);
      const html = nextItems.map((item) => renderCard(item)).join('');
      if (html) gridRef.current.insertAdjacentHTML('beforeend', html);
      nextIndex = end;
      if (nextIndex < items.length) {
        scheduledHandle = scheduleGridChunk(appendChunk);
      } else {
        updateProgress();
        applyInstructionVisibility();
        setGridComplete(true);
        setGridRenderTick((tick) => tick + 1);
      }
    };

    scheduledHandle = scheduleGridChunk(appendChunk);

    return () => {
      cancelled = true;
      scheduledHandle?.cancel();
    };
  }, [bootReady, filtered, initialCardCount, gridHTML]);

  useEffect(() => {
    if (!bootReady || !gridComplete || parityStartedRef.current || !needsParityRecalculation()) return;
    parityStartedRef.current = true;
    void calculateAndCacheAllParityChunked(5, () => updateProgress());
  }, [bootReady, gridComplete]);

  useEffect(() => {
    if (!bootReady || !gridRef.current) return;
    const grid = gridRef.current;
    const measure = () => {
      const columns = getGridColumnCount(grid);
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('.card')).slice(0, Math.max(1, columns * 2));
      if (!cards.length) return;
      const maxHeight = Math.max(...cards.map((card) => card.getBoundingClientRect().height));
      saveCardHeightEstimate(currentPreset, columns, maxHeight);
      setSkeletonCardHeight(maxHeight);
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    Array.from(grid.querySelectorAll<HTMLElement>('.card'))
      .slice(0, 10)
      .forEach((card) => observer.observe(card));

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bootReady, gridRenderTick, storeVersion]);

  const title = 'SquanGo CSP';

  return (
    <>
      {/* <LoadingScreen hidden={true} /> */}
      <div className="container" id="mainContainer">
        <header>
          <h1 className="desktop-title">{title}</h1>
          <h1 className="tablet-title">{title}</h1>
          <h1 className="mobile-title">{title}</h1>
          <div className="subtitle">By Abid & Matt</div>
          <button
            id="sidebarToggleBtn"
            className="sidebar-toggle-btn"
            aria-label="Menu"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('sqg:toggle-sidebar'));
            }}
          >
            <span className="themed-icon themed-icon--menu" style={{ width: 24, height: 24 }} aria-hidden="true" />
          </button>

          <button
            id="profileBtn"
            className="floating-profile-btn"
            aria-label="Profile"
            onClick={(e) => {
              e.stopPropagation();
              (window as unknown as { openProfileModal?: () => void }).openProfileModal?.();
            }}
          >
            <img id="profileBtnAvatar" src={profileAvatar} height={24} width={24} alt="Profile" />
          </button>
        </header>

        <div className="controls" ref={controlsRef}>
          <button
            id="searchToggle"
            ref={searchToggleRef}
            className="search-toggle-btn search-toggle-icon-btn"
            aria-label="Toggle Search"
          >
            <span className="themed-icon themed-icon--search" style={{ width: 22, height: 22 }} aria-hidden="true" />
          </button>
          <input
            ref={searchRef}
            type="text"
            id="search"
            placeholder="Search cubeshapes..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value !== '' && controlsRef.current) {
                controlsRef.current.classList.add('search-expanded');
              }
            }}
          />
          <Dropdown
            id="sort"
            value={sortType}
            options={[
              { value: 'priority', label: 'By Priority', shortLabel: 'Priority', compactLabel: 'Priority' },
              { value: 'probability', label: 'Highest Probability', shortLabel: 'Highest Probability', compactLabel: 'Highest prob.' },
              { value: 'antiProbability', label: 'Lowest Probability', shortLabel: 'Lowest Probability', compactLabel: 'Lowest Prob.' },
            ]}
            onChange={(value) => {
              setSortType(value);
              setNeedsReorder(false, false);
              setShowReorderButton(false);
            }}
          />
          <Dropdown
            id="learnFilter"
            value={learnFilter}
            options={[
              { value: 'all', label: 'Show All', shortLabel: 'All', compactLabel: 'All' },
              { value: 'learned', label: 'Show Only Learned', shortLabel: 'Learned', compactLabel: '✓' },
              { value: 'unlearned', label: 'Exclude Learned', shortLabel: 'Unlearned', compactLabel: '✗' },
            ]}
            onChange={setLearnFilter}
          />
        </div>

        {bootReady ? (
          <div className="grid" id="grid" ref={gridRef} key="grid-real" />
        ) : (
          <div
            className="grid sqg-skeleton-grid"
            id="grid"
            ref={gridRef}
            key="grid-skeleton"
            aria-busy="true"
            style={{ '--sqg-card-estimated-height': `${Math.round(skeletonCardHeight)}px` } as CSSProperties}
          >
            {Array.from({ length: 12 }, (_, idx) => (
              <div className="card sqg-skeleton-card" key={idx}>
                <div className="card-header">
                  <div className="sqg-skeleton-line sqg-skeleton-title" />
                  <div className="sqg-skeleton-line sqg-skeleton-prob" />
                </div>
                <div className="card-images card-svg-container">
                  <div><span className="sqg-skeleton-shape" /></div>
                  <div><span className="sqg-skeleton-shape" /></div>
                </div>
                <div className="card-body">
                  <div className="sqg-skeleton-line" />
                  <div className="sqg-skeleton-line sqg-skeleton-line-short" />
                  <div className="sqg-skeleton-line" />
                  <div className="sqg-skeleton-line sqg-skeleton-line-mid" />
                </div>
              </div>
            ))}
          </div>
        )}

        <footer>
          <p>Please contact for any edits.</p>
        </footer>
      </div>
      {showReorderButton ? (
        <button
          id="reorderButton"
          className="reorder-btn"
          type="button"
          disabled={!gridComplete}
          onClick={() => {
            setNeedsReorder(false, false);
            setShowReorderButton(false);
            reorderExistingGrid(computeFilteredData(searchTerm, sortType, learnFilter));
          }}
        >
          Re-order Cases
        </button>
      ) : null}
      <SettingsModal />
      <HomepageImagesModal />
    </>
  );
}
