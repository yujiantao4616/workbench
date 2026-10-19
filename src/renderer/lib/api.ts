import type { CodexPromptStudioApi } from '../../shared/types';

declare global {
  interface Window {
    codexPromptStudio: CodexPromptStudioApi;
  }
}

export const api = window.codexPromptStudio;
