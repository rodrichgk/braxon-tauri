import { useEffect, useRef, useCallback } from 'react';
import { signalTesterService, WheelSpeeds, TestProfile } from '@/services/signalTesterService';

export interface AutomatedTestConfig {
  duration: number; // in milliseconds
  startFrequencies: WheelSpeeds;
  endFrequencies: WheelSpeeds;
  interpolationType: 'linear' | 'logarithmic';
  updateInterval: number; // in milliseconds
}

export interface AutomatedTestState {
  isRunning: boolean;
  progress: number; // 0 to 1
  remainingTime: number; // in milliseconds
  currentFrequencies: WheelSpeeds;
  elapsedTime: number; // in milliseconds
}

export function useAutomatedTest(
  config: AutomatedTestConfig,
  onStateChange?: (state: AutomatedTestState) => void,
  onComplete?: () => void
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const calculateCurrentFrequencies = useCallback((progress: number): WheelSpeeds => {
    return {
      fl: signalTesterService.interpolateFrequency(
        config.startFrequencies.fl,
        config.endFrequencies.fl,
        progress,
        config.interpolationType
      ),
      fr: signalTesterService.interpolateFrequency(
        config.startFrequencies.fr,
        config.endFrequencies.fr,
        progress,
        config.interpolationType
      ),
      rl: signalTesterService.interpolateFrequency(
        config.startFrequencies.rl,
        config.endFrequencies.rl,
        progress,
        config.interpolationType
      ),
      rr: signalTesterService.interpolateFrequency(
        config.startFrequencies.rr,
        config.endFrequencies.rr,
        progress,
        config.interpolationType
      )
    };
  }, [config]);

  const updateTest = useCallback(async () => {
    if (!isRunningRef.current || !startTimeRef.current) {
      return;
    }

    const now = Date.now();
    const elapsedTime = now - startTimeRef.current;
    const progress = Math.min(elapsedTime / config.duration, 1);
    const remainingTime = Math.max(config.duration - elapsedTime, 0);

    const currentFrequencies = calculateCurrentFrequencies(progress);

    // Send wheel speed message
    await signalTesterService.sendWheelSpeedMessage(currentFrequencies);

    const state: AutomatedTestState = {
      isRunning: isRunningRef.current,
      progress,
      remainingTime,
      currentFrequencies,
      elapsedTime
    };

    onStateChange?.(state);

    // Check if test is complete
    if (progress >= 1) {
      stop();
      onComplete?.();
    }
  }, [config, calculateCurrentFrequencies, onStateChange, onComplete]);

  const start = useCallback(() => {
    if (isRunningRef.current) {
      return;
    }

    isRunningRef.current = true;
    startTimeRef.current = Date.now();

    // Start the update loop
    intervalRef.current = setInterval(updateTest, config.updateInterval);

    // Send initial frequencies immediately
    updateTest();
  }, [updateTest, config.updateInterval]);

  const stop = useCallback(() => {
    if (!isRunningRef.current) {
      return;
    }

    isRunningRef.current = false;
    startTimeRef.current = null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Send zero frequencies to stop all wheels
    signalTesterService.sendWheelSpeedMessage({ fl: 0, fr: 0, rl: 0, rr: 0 });

    const state: AutomatedTestState = {
      isRunning: false,
      progress: 0,
      remainingTime: 0,
      currentFrequencies: { fl: 0, fr: 0, rl: 0, rr: 0 },
      elapsedTime: 0
    };

    onStateChange?.(state);
  }, [onStateChange]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (isRunningRef.current && !intervalRef.current) {
      intervalRef.current = setInterval(updateTest, config.updateInterval);
    }
  }, [updateTest, config.updateInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    start,
    stop,
    pause,
    resume,
    isRunning: isRunningRef.current
  };
}

// Hook for profile-based automated testing
export function useProfileTest(
  profile: TestProfile | null,
  onStateChange?: (state: AutomatedTestState) => void,
  onComplete?: () => void
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const updateProfileTest = useCallback(async () => {
    if (!isRunningRef.current || !startTimeRef.current || !profile) {
      return;
    }

    const now = Date.now();
    const elapsedTime = now - startTimeRef.current;
    const progress = Math.min(elapsedTime / profile.duration, 1);
    const remainingTime = Math.max(profile.duration - elapsedTime, 0);

    const currentFrequencies = signalTesterService.calculateWheelSpeedsFromProfile(
      profile,
      elapsedTime
    );

    // Send wheel speed message
    await signalTesterService.sendWheelSpeedMessage(currentFrequencies);

    const state: AutomatedTestState = {
      isRunning: isRunningRef.current,
      progress,
      remainingTime,
      currentFrequencies,
      elapsedTime
    };

    onStateChange?.(state);

    // Check if test is complete
    if (progress >= 1) {
      stopProfileTest();
      onComplete?.();
    }
  }, [profile, onStateChange, onComplete]);

  const startProfileTest = useCallback(() => {
    if (isRunningRef.current || !profile) {
      return;
    }

    isRunningRef.current = true;
    startTimeRef.current = Date.now();

    // Start the update loop (100ms intervals for smooth playback)
    intervalRef.current = setInterval(updateProfileTest, 100);

    // Send initial frequencies immediately
    updateProfileTest();
  }, [updateProfileTest, profile]);

  const stopProfileTest = useCallback(() => {
    if (!isRunningRef.current) {
      return;
    }

    isRunningRef.current = false;
    startTimeRef.current = null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Send zero frequencies to stop all wheels
    signalTesterService.sendWheelSpeedMessage({ fl: 0, fr: 0, rl: 0, rr: 0 });

    const state: AutomatedTestState = {
      isRunning: false,
      progress: 0,
      remainingTime: 0,
      currentFrequencies: { fl: 0, fr: 0, rl: 0, rr: 0 },
      elapsedTime: 0
    };

    onStateChange?.(state);
  }, [onStateChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    startProfileTest,
    stopProfileTest,
    isRunning: isRunningRef.current
  };
}
