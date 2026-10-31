/**
 * Typed globals bridged onto `window` by the shim modules. Inline HTML emitted
 * by the ported modal generators references these as bare identifiers.
 */

interface TempCaseRename {
  caseName: string;
  newName: string;
  newSubtitle: string;
}

declare global {
  interface Window {
    tempCaseRename: TempCaseRename | null;
    enhancedAccess: boolean;
    evilnessMap: Record<string, boolean>;
    saveState: () => void;
  }
}

export {};
