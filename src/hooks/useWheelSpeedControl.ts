import { useState, useRef, useCallback } from 'react';

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

interface WheelSpeedControlOptions {
  isConnected: boolean;
  sendMessage: (speeds: WheelSpeeds) => void;
}

export function useWheelSpeedControl({ isConnected, sendMessage }: WheelSpeedControlOptions) {
  const [wheelSpeeds, setWheelSpeeds] = useState<WheelSpeeds>({
    fl: 0, fr: 0, rl: 0, rr: 0
  });
  
  const [wheelEnabled, setWheelEnabled] = useState({
    fl: true, fr: true, rl: true, rr: true
  });
  
  const [isLinked, setIsLinked] = useState(true);
  const [masterSpeed, setMasterSpeed] = useState(0);
  
  // Throttling refs
  const nextSendRafRef = useRef<number | null>(null);
  const pendingSpeedsRef = useRef<WheelSpeeds | null>(null);
  const wheelThrottleRef = useRef<number | null>(null);
  const pendingWheelUpdateRef = useRef<{wheel: keyof WheelSpeeds, speed: number} | null>(null);
  const lastSentWheelSpeedsRef = useRef<WheelSpeeds>({fl: -1, fr: -1, rl: -1, rr: -1});

  const sendWheelSpeedMessage = useCallback((speeds: WheelSpeeds) => {
    if (!isConnected) return;
    
    // Check if speeds have actually changed
    const lastSent = lastSentWheelSpeedsRef.current;
    if (speeds.fl === lastSent.fl && speeds.fr === lastSent.fr && 
        speeds.rl === lastSent.rl && speeds.rr === lastSent.rr) {
      return;
    }
    
    sendMessage(speeds);
    lastSentWheelSpeedsRef.current = {...speeds};
  }, [isConnected, sendMessage]);

  const handleMasterSpeedChange = useCallback((newSpeed: number) => {
    setMasterSpeed(newSpeed);
    if (isLinked) {
      const newSpeeds: WheelSpeeds = {
        fl: wheelEnabled.fl ? newSpeed : 0,
        fr: wheelEnabled.fr ? newSpeed : 0,
        rl: wheelEnabled.rl ? newSpeed : 0,
        rr: wheelEnabled.rr ? newSpeed : 0
      };
      setWheelSpeeds(newSpeeds);
      
      // Throttle with RAF
      pendingSpeedsRef.current = newSpeeds;
      if (nextSendRafRef.current == null) {
        nextSendRafRef.current = requestAnimationFrame(() => {
          nextSendRafRef.current = null;
          if (pendingSpeedsRef.current) {
            sendWheelSpeedMessage(pendingSpeedsRef.current);
            pendingSpeedsRef.current = null;
          }
        });
      }
    }
  }, [isLinked, wheelEnabled, sendWheelSpeedMessage]);

  const handleIndividualWheelChange = useCallback((wheel: keyof WheelSpeeds, speed: number) => {
    if (!isLinked) {
      const newSpeeds = { ...wheelSpeeds, [wheel]: wheelEnabled[wheel] ? speed : 0 };
      setWheelSpeeds(newSpeeds);
      
      // Throttle with RAF
      pendingWheelUpdateRef.current = {wheel, speed: wheelEnabled[wheel] ? speed : 0};
      if (wheelThrottleRef.current == null) {
        wheelThrottleRef.current = requestAnimationFrame(() => {
          wheelThrottleRef.current = null;
          if (pendingWheelUpdateRef.current) {
            const update = pendingWheelUpdateRef.current;
            const throttledSpeeds = { ...wheelSpeeds, [update.wheel]: update.speed };
            sendWheelSpeedMessage(throttledSpeeds);
            pendingWheelUpdateRef.current = null;
          }
        });
      }
    }
  }, [isLinked, wheelSpeeds, wheelEnabled, sendWheelSpeedMessage]);

  const toggleWheelEnabled = useCallback((wheel: keyof WheelSpeeds) => {
    const newEnabled = { ...wheelEnabled, [wheel]: !wheelEnabled[wheel] };
    setWheelEnabled(newEnabled);
    
    if (isLinked) {
      const newSpeeds = {
        fl: newEnabled.fl ? masterSpeed : 0,
        fr: newEnabled.fr ? masterSpeed : 0,
        rl: newEnabled.rl ? masterSpeed : 0,
        rr: newEnabled.rr ? masterSpeed : 0
      };
      setWheelSpeeds(newSpeeds);
      sendWheelSpeedMessage(newSpeeds);
    } else {
      const newSpeeds = { ...wheelSpeeds, [wheel]: newEnabled[wheel] ? wheelSpeeds[wheel] : 0 };
      setWheelSpeeds(newSpeeds);
      sendWheelSpeedMessage(newSpeeds);
    }
  }, [wheelEnabled, isLinked, masterSpeed, wheelSpeeds, sendWheelSpeedMessage]);

  const toggleLinked = useCallback(() => {
    setIsLinked(prev => !prev);
  }, []);

  return {
    wheelSpeeds,
    setWheelSpeeds,
    wheelEnabled,
    isLinked,
    masterSpeed,
    handleMasterSpeedChange,
    handleIndividualWheelChange,
    toggleWheelEnabled,
    toggleLinked
  };
}
