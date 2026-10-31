import { notify } from './store';

export const SETTINGS_TABS = [
  { id: 'homescreen', label: 'Personalization' },
  { id: 'parity', label: 'Parity Tracer Settings' },
  { id: 'trainer', label: 'Trainer Settings' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

let settingsActiveTab: SettingsTabId = 'homescreen';
let settingsOpen = false;

export function isSettingsOpen(): boolean {
  return settingsOpen;
}

export function getSettingsActiveTab(): SettingsTabId {
  return settingsActiveTab;
}

export function openUnifiedSettings(tabId: SettingsTabId = 'homescreen'): void {
  settingsActiveTab = tabId;
  settingsOpen = true;
  notify();
}

export function closeUnifiedSettings(): void {
  settingsOpen = false;
  notify();
}

export function switchSettingsTab(tabId: SettingsTabId): void {
  settingsActiveTab = tabId;
  notify();
}

export function openHomepageImageSettings(): void {
  window.dispatchEvent(new Event('sqg:open-homepage-images'));
}
