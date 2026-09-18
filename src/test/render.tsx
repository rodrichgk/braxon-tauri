/* `renderWithProviders` — render a component inside the same context stack
   App.tsx mounts, so `useSession`, `useAppSettings`, `useTheme`, `useReports`,
   `useTestSession` and `useDevGate` all work without each test rebuilding the
   tree.

   All six providers are real (they're cheap and localStorage-backed). The
   ones that call `invoke`/`listen` on mount already swallow failures, so with
   the default rejecting IPC from setup.ts they render fine; pass `tauri` to
   give them real answers. Seed a logged-in user with `user`. */

import { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { vi } from "vitest";

import i18n from "@/i18n";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { SessionProvider, type AppUser } from "@/contexts/SessionContext";
import { DevGateProvider } from "@/contexts/DevGateContext";
import { TestSessionProvider } from "@/contexts/TestSessionContext";
import { ReportsProvider } from "@/contexts/ReportsContext";
import { mockTauri, type CommandHandler } from "@/test/tauri";

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** Tauri command→handler map, installed before render (see src/test/tauri.ts). */
  tauri?: Record<string, CommandHandler>;
  /** Resolve any unlisted Tauri command with this instead of rejecting — for
   *  "renders without throwing" smoke tests of big trees. e.g. `() => []`. */
  tauriFallback?: (cmd: string, args: Record<string, unknown>) => unknown;
  /** Pre-populate the session as this user (writes the localStorage keys the
   *  provider reads in its initializer). */
  user?: AppUser | null;
  /** Spy captured for assertions on `navigateTo`. */
  navigateTo?: (page: string) => void;
  /** Set the i18n language for the test (default: leave as-is). */
  language?: "en" | "fr";
}

function seedSession(user: AppUser) {
  localStorage.setItem("session_user_id", user.id);
  localStorage.setItem("session_user_name", user.name);
  if (user.role) localStorage.setItem("session_user_role", user.role);
  if (user.remanTechId) localStorage.setItem("session_user_reman_tech_id", user.remanTechId);
  if (user.remanTechName) localStorage.setItem("session_user_reman_tech_name", user.remanTechName);
  localStorage.setItem("session_expires_at", String(Date.now() + 8 * 60 * 60 * 1000));
}

export interface RenderWithProviders extends RenderResult {
  /** `@testing-library/user-event` instance, already `.setup()`-ed. */
  user: ReturnType<typeof userEvent.setup>;
  /** The `navigateTo` spy handed to `TestSessionProvider`. */
  navigateTo: ReturnType<typeof vi.fn>;
  /** Recorded Tauri calls when `tauri` was passed. */
  tauriCalls: Array<{ cmd: string; args: Record<string, unknown> }>;
}

export function renderWithProviders(
  ui: ReactElement,
  opts: RenderWithProvidersOptions = {},
): RenderWithProviders {
  const { tauri, tauriFallback, user: sessionUser, navigateTo, language, ...rest } = opts;

  if (language) void i18n.changeLanguage(language);
  if (sessionUser) seedSession(sessionUser);

  const tauriResult =
    tauri || tauriFallback
      ? mockTauri(tauri ?? {}, tauriFallback ? { fallback: tauriFallback } : {})
      : { calls: [] as RenderWithProviders["tauriCalls"] };
  const navSpy = vi.fn(navigateTo);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <AppSettingsProvider>
          <SessionProvider>
            <DevGateProvider>
              <TestSessionProvider navigateTo={navSpy}>
                <ReportsProvider>{children}</ReportsProvider>
              </TestSessionProvider>
            </DevGateProvider>
          </SessionProvider>
        </AppSettingsProvider>
      </ThemeProvider>
    </I18nextProvider>
  );

  const result = render(ui, { wrapper: Wrapper, ...rest });
  return {
    ...result,
    user: userEvent.setup(),
    navigateTo: navSpy,
    tauriCalls: tauriResult.calls,
  };
}

export * from "@testing-library/react";
export { userEvent };
