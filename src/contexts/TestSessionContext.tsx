import { createContext, useContext, useState, ReactNode } from "react";
import type { Page } from "../components/Navigation";

export interface LinkedJob {
  ligcdeId: string;
  clientName: string;
  reference: string;
  vehiclePlate: string;
  vehicleModel: string;
}

interface TestSessionContextType {
  activeHydraulicJob: LinkedJob | null;
  setActiveHydraulicJob: (job: LinkedJob | null) => void;
  navigateTo: (page: Page) => void;
}

const TestSessionContext = createContext<TestSessionContextType | null>(null);

export function TestSessionProvider({
  children,
  navigateTo,
}: {
  children: ReactNode;
  navigateTo: (page: Page) => void;
}) {
  const [activeHydraulicJob, setActiveHydraulicJob] = useState<LinkedJob | null>(null);

  return (
    <TestSessionContext.Provider
      value={{
        activeHydraulicJob,
        setActiveHydraulicJob,
        navigateTo,
      }}
    >
      {children}
    </TestSessionContext.Provider>
  );
}

export function useTestSession() {
  const context = useContext(TestSessionContext);
  if (!context) {
    throw new Error("useTestSession must be used within a TestSessionProvider");
  }
  return context;
}
