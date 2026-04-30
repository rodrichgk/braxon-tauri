import { useState } from "react";
import { Toaster } from "react-hot-toast";
import Navigation, { Page } from "./components/Navigation";
import ConnectionBar from "./components/ConnectionBar";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { ToastProvider } from "./contexts/ToastContext";
import HomePage from "./pages/Home";
import ValvesPage from "./pages/Valves";
import MotorsPage from "./pages/Motors";
import SignalPage from "./pages/Signal";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");

  return (
    <ToastProvider>
      <WebSocketProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
          {/* Connection bar - always visible at top */}
          <ConnectionBar />
          {/* Navigation tabs */}
          <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            {currentPage === "home"   && <HomePage />}
            {currentPage === "valves" && <ValvesPage />}
            {currentPage === "motors" && <MotorsPage />}
            {currentPage === "signal" && <SignalPage />}
          </main>
          <Toaster position="top-right" />
        </div>
      </WebSocketProvider>
    </ToastProvider>
  );
}

export default App;
