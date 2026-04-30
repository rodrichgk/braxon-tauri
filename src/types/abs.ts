export type ABSModuleType = 'MK60' | 'MK61' | 'MK70' | 'MK100' | 'Bosch_8.0' | 'Bosch_9.0';

export type ValveStatus = 'active' | 'inactive' | 'testing';

export interface Valve {
  id: number;
  name: string;
  health: number;
  status: ValveStatus;
}

export interface ABSModule {
  id: string;
  name: string;
  valveCount: number;
  description: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ABSProfile {
  module: ABSModule;
  valves: Valve[];
}

export interface TestSequence {
  id: string;
  name: string;
  steps: {
    valveIds: number[];
    duration: number;
  }[];
}

export interface TestResult {
  valveId: number;
  timestamp: string;
  health: number;
  passed: boolean;
  details: string;
}
