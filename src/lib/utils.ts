// Utility functions for Tauri app
export function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
