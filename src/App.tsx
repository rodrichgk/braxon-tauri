import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "react-hot-toast";
import { appWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import { LogoSymbol, LogoName } from "./components/Logo";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppSettingsProvider } from "./contexts/AppSettingsContext";
import { SessionProvider } from "./contexts/SessionContext";
import LoginModal from "./components/LoginModal";
import UpdateChecker from "./components/UpdateChecker";
import type { Page } from "./components/Navigation";

import HomePage from "./pages/Home";
import ValvesPage from "./pages/Valves";
import MotorsPage from "./pages/Motors";
import SignalPage from "./pages/Signal";
import JobsPage from "./pages/Jobs";

/* ── Page transition variants ─────────────────────────────── */
const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/* ── Splash screen ─────────────────────────────────────────── */
function SplashScreen({ onDone, rounded }: { onDone: () => void; rounded: boolean }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-app ${rounded ? 'rounded-xl' : ''}`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeInOut" } }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex flex-col items-center gap-5"
      >
        <LogoSymbol className="h-20 w-auto text-text-primary" />
        <LogoName className="h-6 w-auto text-text-primary" />
        <p className="text-sm text-text-tertiary">ABS Hydraulic Diagnostics Platform</p>
        <motion.div className="w-32 h-0.5 bg-white/5 rounded-full overflow-hidden mt-2">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ── App ───────────────────────────────────────────────────── */
function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [splashDone, setSplashDone] = useState(false);
  const [windowed, setWindowed] = useState(true); // false when maximized or fullscreen

  useEffect(() => {
    const check = async () => {
      const maximized  = await appWindow.isMaximized();
      const fullscreen = await appWindow.isFullscreen();
      setWindowed(!(maximized || fullscreen));
    };
    check();
    let unlisten: (() => void) | undefined;
    appWindow.onResized(() => { check(); }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  return (
    <ThemeProvider>
    <SessionProvider>
    <AppSettingsProvider>
        <div className={[
          "h-screen flex bg-app overflow-hidden",
          windowed ? "rounded-xl ring-1 ring-white/[0.06]" : "",
        ].join(" ")}>

          {/* Splash */}
          <AnimatePresence>
            {!splashDone && (
              <SplashScreen onDone={() => setSplashDone(true)} rounded={windowed} />
            )}
          </AnimatePresence>

          {/* Login modal — shown after splash if not logged in */}
          {splashDone && <LoginModal />}

          {/* Shell — fades in after splash */}
          <motion.div
            className="flex flex-col h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: splashDone ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <TitleBar />
            <UpdateChecker />

            <div className="flex flex-1 min-h-0">
              <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

              <main className="flex-1 overflow-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPage}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="min-h-full"
                  >
                    {currentPage === "home"   && <HomePage />}
                    {currentPage === "valves" && <ValvesPage />}
                    {currentPage === "motors" && <MotorsPage />}
                    {currentPage === "signal" && <SignalPage />}
                    {currentPage === "jobs"   && <JobsPage />}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
          </motion.div>

        </div>

        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1c1c1e',
              color: '#f5f5f7',
              border: '1px solid #2c2c2f',
              borderRadius: '12px',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '10px 14px',
            },
            success: { iconTheme: { primary: '#30d158', secondary: '#1c1c1e' } },
            error:   { iconTheme: { primary: '#ff453a', secondary: '#1c1c1e' } },
          }}
        />
    </AppSettingsProvider>
    </SessionProvider>
    </ThemeProvider>
  );
}

export default App;
