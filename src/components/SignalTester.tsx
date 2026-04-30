"use client";

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { toast } from 'react-hot-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { PlayIcon, PauseIcon, ArrowPathIcon, LinkIcon } from '@heroicons/react/24/solid';

interface SignalTesterProps {
  sendMessage: (message: string) => void;
  wssType?: string;
}

// Wheel speed interface
interface WheelSpeeds {
  fl: number; // Front Left
  fr: number; // Front Right
  rl: number; // Rear Left
  rr: number; // Rear Right
}

// Define point structure for custom profiles
interface ProfilePoint {
  time: number;  // Time in seconds
  frequency: number;  // Frequency in Hz
}

// Server profile type
interface ServerProfile {
  id: string;
  name: string;
  points: string; // JSON string of profile points
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export default function SignalTester({ sendMessage, wssType }: SignalTesterProps) {
  const { isConnectedToDevice } = useWebSocketContext();
  const [frequency, setFrequency] = useState(0);
  const [maxFrequency, setMaxFrequency] = useState(1500); // Maximum 1500Hz for ABS testing
  const [signalType, setSignalType] = useState<'sine' | 'square'>('sine');

  // Auto-configure signal type from WSS type (active = square, passive = sine)
  useEffect(() => {
    if (!wssType) return;
    const lower = wssType.toLowerCase();
    if (lower.includes('actif') || lower.includes('active') || lower.includes('hall')) {
      setSignalType('square');
    } else if (lower.includes('passif') || lower.includes('passive') || lower.includes('inductif') || lower.includes('inductive')) {
      setSignalType('sine');
    }
  }, [wssType]);

  const [isAutoTesting, setIsAutoTesting] = useState(false);
  const [isHardwareTesting, setIsHardwareTesting] = useState(false);
  const [remainingTime, setRemainingTime] = useState(900); // 15 minutes in seconds
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Wheel speed states
  const [wheelSpeeds, setWheelSpeeds] = useState<WheelSpeeds>({
    fl: 0, fr: 0, rl: 0, rr: 0
  });
  
  // Individual wheel enable/disable states
  const [wheelEnabled, setWheelEnabled] = useState({
    fl: true, fr: true, rl: true, rr: true
  });
  
  // Linked control state
  const [isLinked, setIsLinked] = useState(true);
  
  // Active/Passive mode for wheel speed signals
  const [isActiveMode, setIsActiveMode] = useState(true);

  // Handle active/passive mode switching
  const handleModeSwitch = () => {
    const newMode = !isActiveMode;
    setIsActiveMode(newMode);
    if (sendMessage) {
      const message = JSON.stringify({
        type: 5, // MSG_SWITCH_RELAY
        mode: newMode ? 'active' : 'passive'
      });
      sendMessage(message);
    }
  };
  
  // Master speed for linked control
  const [masterSpeed, setMasterSpeed] = useState(0);
  const nextSendRafRef = useRef<number | null>(null);
  const pendingSpeedsRef = useRef<WheelSpeeds | null>(null);
  const maxSpeed = 1500;
  
  // Throttling for frequency slider
  const frequencyThrottleRef = useRef<number | null>(null);
  const pendingFrequencyRef = useRef<number | null>(null);
  
  // Throttling for individual wheel sliders
  const wheelThrottleRef = useRef<number | null>(null);
  const pendingWheelUpdateRef = useRef<{wheel: keyof WheelSpeeds, speed: number} | null>(null);
  
  // Track last sent values to prevent redundant sends
  const lastSentFrequencyRef = useRef<number>(-1);
  const lastSentWheelSpeedsRef = useRef<WheelSpeeds>({fl: -1, fr: -1, rl: -1, rr: -1});

  // State for profiles from server
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfilePoint[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<number | null>(null);

  // State for recording frequency changes
  const [isRecording, setIsRecording] = useState(false);
  const [recordedProfile, setRecordedProfile] = useState<ProfilePoint[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);

  // Wheel speed control functions
  const handleMasterSpeedChange = (newSpeed: number) => {
    setMasterSpeed(newSpeed);
    if (isLinked) {
      const newSpeeds: WheelSpeeds = {
        fl: wheelEnabled.fl ? newSpeed : 0,
        fr: wheelEnabled.fr ? newSpeed : 0,
        rl: wheelEnabled.rl ? newSpeed : 0,
        rr: wheelEnabled.rr ? newSpeed : 0
      };
      setWheelSpeeds(newSpeeds);
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
  };

  const handleIndividualWheelChange = (wheel: keyof WheelSpeeds, speed: number) => {
    if (!isLinked) {
      const newSpeeds = { ...wheelSpeeds, [wheel]: wheelEnabled[wheel] ? speed : 0 };
      setWheelSpeeds(newSpeeds);
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
  };

  const toggleWheelEnabled = (wheel: keyof WheelSpeeds) => {
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
  };

  const sendWheelSpeedMessage = (speeds: WheelSpeeds) => {
    if (!isConnectedToDevice) return;
    const lastSent = lastSentWheelSpeedsRef.current;
    if (speeds.fl === lastSent.fl && speeds.fr === lastSent.fr && 
        speeds.rl === lastSent.rl && speeds.rr === lastSent.rr) {
      return;
    }
    const message = JSON.stringify({
      type: 3,
      fl: speeds.fl,
      fr: speeds.fr,
      rl: speeds.rl,
      rr: speeds.rr,
      timestamp: Date.now()
    });
    sendMessage(message);
    lastSentWheelSpeedsRef.current = {...speeds};
  };

  // Listen for WebSocket messages containing wheel speed data
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 3) {
          setWheelSpeeds({
            fl: data.fl || 0,
            fr: data.fr || 0,
            rl: data.rl || 0,
            rr: data.rr || 0
          });
        }
      } catch (error) {
        // Ignore non-JSON messages
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleWebSocketMessage);
      return () => window.removeEventListener('message', handleWebSocketMessage);
    }
  }, []);

  // Cleanup RAF throttle refs on unmount
  useEffect(() => {
    return () => {
      if (nextSendRafRef.current !== null) cancelAnimationFrame(nextSendRafRef.current);
      if (frequencyThrottleRef.current !== null) cancelAnimationFrame(frequencyThrottleRef.current);
      if (wheelThrottleRef.current !== null) cancelAnimationFrame(wheelThrottleRef.current);
    };
  }, []);

  // Record frequency changes when slider is moved
  useEffect(() => {
    if (!isRecording) return;
    if (recordingStartTimeRef.current === null) {
      recordingStartTimeRef.current = Date.now();
      setRecordedProfile([{ time: 0, frequency: 0 }]);
      return;
    }
    const elapsedSeconds = (Date.now() - recordingStartTimeRef.current) / 1000;
    setRecordedProfile(prev => {
      const lastPoint = prev[prev.length - 1];
      if (lastPoint && lastPoint.frequency === frequency) return prev;
      return [...prev, { time: elapsedSeconds, frequency }];
    });
  }, [frequency, isRecording]);

  // For auto testing with recorded profile
  useEffect(() => {
    if (!isPlayingRecorded || !isConnectedToDevice || recordedProfile.length === 0) return;
    sendMessage(`Frequency : 0\n`);
    const sortedPoints = [...recordedProfile].sort((a, b) => a.time - b.time);
    const totalDuration = sortedPoints[sortedPoints.length - 1].time;
    let testStartTime = Date.now();
    let lastTimerUpdate = Date.now();

    const timerInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastTimerUpdate >= 1000) {
        lastTimerUpdate = now;
        setRemainingTime(prev => {
          if (prev <= 1) {
            setFrequency(0);
            sendWaveformMessage(0, 0);
            setIsPlayingRecorded(false);
            return 900;
          }
          return prev - 1;
        });
      }
    }, 500);

    const updateInterval = setInterval(() => {
      if (!isPlayingRecorded) return;
      const now = Date.now();
      const elapsedSinceStart = (now - testStartTime) / 1000;
      const loopDuration = totalDuration + 1;
      const currentLoop = Math.floor(elapsedSinceStart / loopDuration);
      const timeInCurrentLoop = elapsedSinceStart - (currentLoop * loopDuration);
      if (timeInCurrentLoop >= totalDuration) {
        setFrequency(0);
        sendMessage(`Frequency : 0\n`);
        return;
      }
      const profileElapsed = timeInCurrentLoop;
      let currentFreq = 0;
      if (sortedPoints.length === 1) {
        currentFreq = sortedPoints[0].frequency;
      } else {
        let foundSegment = false;
        for (let i = 0; i < sortedPoints.length - 1; i++) {
          const currentPoint = sortedPoints[i];
          const nextPoint = sortedPoints[i + 1];
          if (profileElapsed >= currentPoint.time && profileElapsed <= nextPoint.time) {
            const segmentDuration = nextPoint.time - currentPoint.time;
            const timeRatio = segmentDuration > 0 ? (profileElapsed - currentPoint.time) / segmentDuration : 0;
            currentFreq = currentPoint.frequency + timeRatio * (nextPoint.frequency - currentPoint.frequency);
            foundSegment = true;
            break;
          }
        }
        if (!foundSegment) currentFreq = sortedPoints[sortedPoints.length - 1].frequency;
      }
      currentFreq = Math.max(0, Math.min(maxFrequency, currentFreq));
      const roundedFreq = Math.round(currentFreq);
      setFrequency(roundedFreq);
      if (roundedFreq !== lastSentFrequencyRef.current) {
        sendMessage(`Frequency : ${roundedFreq}\n`);
        lastSentFrequencyRef.current = roundedFreq;
      }
    }, 50);

    return () => {
      clearInterval(timerInterval);
      clearInterval(updateInterval);
    };
  }, [isPlayingRecorded, isConnectedToDevice, recordedProfile, maxFrequency, sendMessage, signalType]);

  // For auto testing with custom profile
  useEffect(() => {
    if (!isAutoTesting || !isConnectedToDevice || activeProfile.length === 0) return;
    sendMessage(`Frequency : 0\n`);
    const sortedPoints = [...activeProfile].sort((a, b) => a.time - b.time);
    const totalDuration = sortedPoints[sortedPoints.length - 1].time;
    let testStartTime = Date.now();
    let lastTimerUpdate = Date.now();

    const timerInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastTimerUpdate >= 1000) {
        lastTimerUpdate = now;
        setRemainingTime(prev => {
          if (prev <= 1) {
            setFrequency(0);
            sendWaveformMessage(0, 0);
            setIsAutoTesting(false);
            return 900;
          }
          return prev - 1;
        });
      }
    }, 500);

    const updateInterval = setInterval(() => {
      if (!isAutoTesting) return;
      const now = Date.now();
      const elapsedSinceStart = (now - testStartTime) / 1000;
      const loopDuration = totalDuration + 1;
      const currentLoop = Math.floor(elapsedSinceStart / loopDuration);
      const timeInCurrentLoop = elapsedSinceStart - (currentLoop * loopDuration);
      if (timeInCurrentLoop >= totalDuration) {
        setFrequency(0);
        sendMessage(`Frequency : 0\n`);
        return;
      }
      const profileElapsed = timeInCurrentLoop;
      let currentFreq = 0;
      if (sortedPoints.length === 1) {
        currentFreq = sortedPoints[0].frequency;
      } else {
        let foundSegment = false;
        for (let i = 0; i < sortedPoints.length - 1; i++) {
          const currentPoint = sortedPoints[i];
          const nextPoint = sortedPoints[i + 1];
          if (profileElapsed >= currentPoint.time && profileElapsed <= nextPoint.time) {
            const segmentDuration = nextPoint.time - currentPoint.time;
            const timeRatio = segmentDuration > 0 ? (profileElapsed - currentPoint.time) / segmentDuration : 0;
            currentFreq = currentPoint.frequency + timeRatio * (nextPoint.frequency - currentPoint.frequency);
            foundSegment = true;
            break;
          }
        }
        if (!foundSegment) currentFreq = sortedPoints[sortedPoints.length - 1].frequency;
      }
      currentFreq = Math.max(0, Math.min(maxFrequency, currentFreq));
      const roundedFreq = Math.round(currentFreq);
      setFrequency(roundedFreq);
      if (roundedFreq !== lastSentFrequencyRef.current) {
        sendMessage(`Frequency : ${roundedFreq}\n`);
        lastSentFrequencyRef.current = roundedFreq;
      }
    }, 50);

    return () => {
      clearInterval(timerInterval);
      clearInterval(updateInterval);
    };
  }, [isAutoTesting, isConnectedToDevice, activeProfile, maxFrequency, sendMessage, signalType]);

  // Draw the wheel speed signal waveforms
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const width = rect.width;
    const height = rect.height;
    const wheelColors = {
      fl: '#ef4444',
      fr: '#3b82f6',
      rl: '#10b981',
      rr: '#f59e0b'
    };
    let startTime: number;
    const draw = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsedTime = timestamp - startTime;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      for (let i = 1; i < 10; i++) {
        const x = (width / 10) * i;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('FL', 5, 20);
      ctx.fillText('FR', 5, height/4 + 20);
      ctx.fillText('RL', 5, height/2 + 20);
      ctx.fillText('RR', 5, 3*height/4 + 20);
      const hasAnySignal = Object.values(wheelSpeeds).some(speed => speed > 0) && 
                          Object.values(wheelEnabled).some(enabled => enabled);
      if (!isConnectedToDevice || !hasAnySignal) {
        ctx.strokeStyle = isConnectedToDevice ? '#9ca3af' : '#d1d5db';
        ctx.lineWidth = 2;
        Object.keys(wheelSpeeds).forEach((_wheel, index) => {
          const yCenter = (height / 4) * index + (height / 8);
          ctx.beginPath();
          ctx.moveTo(30, yCenter);
          ctx.lineTo(width, yCenter);
          ctx.stroke();
        });
        return;
      }
      Object.entries(wheelSpeeds).forEach(([wheel, speed], index) => {
        const isEnabled = wheelEnabled[wheel as keyof WheelSpeeds];
        const wheelKey = wheel as keyof typeof wheelColors;
        if (!isEnabled || speed === 0) {
          ctx.strokeStyle = '#d1d5db';
          ctx.lineWidth = 1;
          const yCenter = (height / 4) * index + (height / 8);
          ctx.beginPath();
          ctx.moveTo(30, yCenter);
          ctx.lineTo(width, yCenter);
          ctx.stroke();
          return;
        }
        const period = 1000 / speed;
        const amplitude = height / 12;
        const yCenter = (height / 4) * index + (height / 8);
        ctx.strokeStyle = wheelColors[wheelKey];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, yCenter);
        const pixelsPerPeriod = Math.max(20, (width - 30) / 8);
        const halfPeriodPixels = pixelsPerPeriod / 2;
        const timeOffset = (elapsedTime % period) / period * pixelsPerPeriod;
        for (let x = 30 - timeOffset; x < width; ) {
          ctx.lineTo(x, yCenter - amplitude);
          x += halfPeriodPixels;
          ctx.lineTo(x, yCenter - amplitude);
          ctx.lineTo(x, yCenter + amplitude);
          x += halfPeriodPixels;
          ctx.lineTo(x, yCenter + amplitude);
        }
        ctx.stroke();
        ctx.fillStyle = wheelColors[wheelKey];
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${speed}Hz`, width - 5, (height / 4) * index + 15);
      });
      if (isConnectedToDevice && hasAnySignal) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };
    const hasAnySignal = Object.values(wheelSpeeds).some(speed => speed > 0) && 
                        Object.values(wheelEnabled).some(enabled => enabled);
    if (isConnectedToDevice && hasAnySignal) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      draw(0);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [wheelSpeeds, wheelEnabled, isConnectedToDevice]);

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setFrequency(value);
    pendingFrequencyRef.current = value;
    if (frequencyThrottleRef.current == null) {
      frequencyThrottleRef.current = requestAnimationFrame(() => {
        frequencyThrottleRef.current = null;
        if (pendingFrequencyRef.current !== null && isConnectedToDevice) {
          const freqToSend = pendingFrequencyRef.current;
          if (freqToSend !== lastSentFrequencyRef.current) {
            sendMessage(`Frequency : ${freqToSend}\n`);
            lastSentFrequencyRef.current = freqToSend;
          }
          pendingFrequencyRef.current = null;
        }
      });
    }
  };

  const sendWaveformMessage = (waveType: number, freq: number) => {
    if (isConnectedToDevice) {
      if (waveType === 0) {
        sendMessage(`Waveform : 0,0\n`);
      } else {
        sendMessage(`Waveform : ${waveType},${freq}\n`);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleAutoTest = () => {
    if (!isAutoTesting) {
      setRemainingTime(900);
      setFrequency(0);
      sendMessage(`Frequency : 0\n`);
      lastSentFrequencyRef.current = 0;
    } else {
      setFrequency(0);
      sendWaveformMessage(0, 0);
      lastSentFrequencyRef.current = 0;
    }
    setIsAutoTesting(!isAutoTesting);
  };

  const addProfilePoint = () => {
    const newPoint: ProfilePoint = { time: 7.5, frequency: maxFrequency / 2 };
    setActiveProfile([...activeProfile, newPoint]);
    setEditingPoint(activeProfile.length);
  };

  const removeProfilePoint = () => {
    if (editingPoint !== null && activeProfile.length > 2) {
      const newProfile = activeProfile.filter((_, i) => i !== editingPoint);
      setActiveProfile(newProfile);
      setEditingPoint(null);
    }
  };

  const handleProfileCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!profileCanvasRef.current) return;
    const canvas = profileCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const margin = { left: 30, right: 20, top: 20, bottom: 30 };
    const plotWidth = rect.width - margin.left - margin.right;
    const plotHeight = rect.height - margin.top - margin.bottom;
    if (x < margin.left || x > rect.width - margin.right ||
        y < margin.top || y > rect.height - margin.bottom) {
      return;
    }
    const clickTime = Math.max(0, Math.min(15, ((x - margin.left) / plotWidth) * 15));
    const clickFreq = Math.max(0, Math.min(maxFrequency, (1 - (y - margin.top) / plotHeight) * maxFrequency));
    let foundPointIndex: number | null = null;
    activeProfile.forEach((point, index) => {
      const pointX = margin.left + (point.time / 15) * plotWidth;
      const pointY = margin.top + plotHeight - (point.frequency / maxFrequency) * plotHeight;
      const distance = Math.sqrt(Math.pow(pointX - x, 2) + Math.pow(pointY - y, 2));
      if (distance < 10) foundPointIndex = index;
    });
    if (foundPointIndex !== null) {
      setEditingPoint(foundPointIndex);
    } else {
      if (editingPoint !== null) {
        const newProfile = [...activeProfile];
        newProfile[editingPoint] = { time: clickTime, frequency: Math.round(clickFreq) };
        setActiveProfile(newProfile.sort((a, b) => a.time - b.time));
      } else {
        const newProfile = [...activeProfile, { time: clickTime, frequency: Math.round(clickFreq) }];
        setActiveProfile(newProfile.sort((a, b) => a.time - b.time));
        setEditingPoint(newProfile.findIndex(p => p.time === clickTime && p.frequency === Math.round(clickFreq)));
      }
    }
  };

  // Fetch profiles from DB via Tauri invoke
  const fetchProfiles = async () => {
    setIsLoadingProfiles(true);
    try {
      const data = await invoke<ServerProfile[]>('get_profiles');
      setProfiles(data);
      if (data.length > 0 && !selectedProfileId) {
        const firstProfile = data[0];
        setSelectedProfileName(firstProfile.name);
        setSelectedProfileId(firstProfile.id);
        setActiveProfile(JSON.parse(firstProfile.points));
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error('Failed to load profiles');
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Save current profile
  const saveProfile = async () => {
    const profileName = prompt("Enter a name for this profile:", selectedProfileName);
    if (!profileName) return;
    try {
      if (selectedProfileId) {
        await invoke('update_profile', {
          profile: {
            id: selectedProfileId,
            name: profileName,
            points: JSON.stringify(activeProfile),
            isDefault: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        });
        toast.success('Profile updated successfully');
      } else {
        const newId = generateId();
        await invoke('save_profile', {
          profile: {
            id: newId,
            name: profileName,
            points: JSON.stringify(activeProfile),
            isDefault: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        });
        setSelectedProfileId(newId);
        toast.success('Profile created successfully');
      }
      await fetchProfiles();
      setSelectedProfileName(profileName);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save profile');
    }
  };

  const loadProfile = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setActiveProfile(JSON.parse(profile.points));
      setSelectedProfileName(profile.name);
      setSelectedProfileId(profile.id);
      setEditingPoint(null);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      recordingStartTimeRef.current = null;
      setRecordedProfile([]);
      setIsRecording(true);
    } else {
      const elapsedSeconds = recordingStartTimeRef.current
        ? (Date.now() - recordingStartTimeRef.current) / 1000
        : 0;
      setRecordedProfile(prev => {
        const lastPoint = prev[prev.length - 1];
        if (lastPoint && lastPoint.frequency === 0 && frequency === 0) return prev;
        return [...prev, { time: Math.max(elapsedSeconds, prev[prev.length-1]?.time || 0), frequency }];
      });
      setIsRecording(false);
    }
  };

  const playRecordedProfile = () => {
    if (recordedProfile.length < 2) {
      alert("Please record a profile first (at least 2 points)!");
      return;
    }
    setRemainingTime(900);
    setFrequency(0);
    sendMessage(`Frequency : 0\n`);
    lastSentFrequencyRef.current = 0;
    setIsPlayingRecorded(true);
  };

  const stopPlayingRecorded = () => {
    setIsPlayingRecorded(false);
    setFrequency(0);
    sendWaveformMessage(0, 0);
    lastSentFrequencyRef.current = 0;
  };

  // Save recorded profile to DB via Tauri invoke
  const saveRecordedProfile = async () => {
    if (recordedProfile.length < 2) {
      toast.error("Please record a profile first (at least 2 points)!");
      return;
    }
    const profileName = prompt("Enter a name for this recorded profile:");
    if (!profileName) return;
    try {
      await invoke('save_profile', {
        profile: {
          id: generateId(),
          name: profileName,
          points: JSON.stringify(recordedProfile),
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      });
      toast.success('Recorded profile saved successfully');
      await fetchProfiles();
      setActiveProfile(recordedProfile);
      setSelectedProfileName(profileName);
    } catch (error) {
      console.error('Error saving recorded profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save recorded profile');
    }
  };

  return (
    <div className="card">
      <h2 className="card-header flex items-center">
        <span className="mr-2">Signal Tester</span>
        {isConnectedToDevice ? (
          <span className="connection-dot connection-connected animate-pulse">Connected</span>
        ) : (
          <span className="connection-dot connection-disconnected">Disconnected</span>
        )}
      </h2>

      {/* Waveform Display Area */}
      <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded-xl mb-6 overflow-hidden shadow-inner transition-colors">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Wheel Speed Controls */}
      <div className="mt-6 card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">ABS Wheel Speed Signals</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Signal:</span>
              <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                <button
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${signalType === 'sine' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  onClick={() => { 
                    setSignalType('sine');
                    if(isConnectedToDevice) sendMessage(`Waveform : 2,${frequency}\n`);
                  }}
                  disabled={isAutoTesting || isPlayingRecorded}
                >
                  Sine
                </button>
                <button
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${signalType === 'square' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  onClick={() => { 
                    setSignalType('square');
                    if(isConnectedToDevice) sendMessage(`Waveform : 1,${frequency}\n`);
                  }}
                  disabled={isAutoTesting || isPlayingRecorded}
                >
                  Square
                </button>
              </div>
            </div>
            <button
              onClick={handleModeSwitch}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActiveMode ? 'btn-success' : 'btn-warning'}`}
              disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded}
            >
              {isActiveMode ? 'Active' : 'Passive'}
            </button>
            <button
              onClick={() => setIsLinked(!isLinked)}
              className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isLinked ? 'btn-primary' : 'btn-secondary'}`}
            >
              <LinkIcon className="w-4 h-4 mr-1" />
              {isLinked ? 'Linked' : 'Individual'}
            </button>
          </div>
        </div>

        {isLinked ? (
          <div className="space-y-4">
            <div>
              <label className="input-label block mb-2">
                Master Speed: <span className="font-bold status-info">{masterSpeed} Hz</span>
              </label>
              <input
                type="range"
                min="0"
                max={maxSpeed}
                value={masterSpeed}
                onChange={(e) => handleMasterSpeedChange(parseInt(e.target.value))}
                onInput={(e) => handleMasterSpeedChange(parseInt((e.target as HTMLInputElement).value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(wheelEnabled).map(([wheel, enabled]) => (
                <button
                  key={wheel}
                  onClick={() => toggleWheelEnabled(wheel as keyof WheelSpeeds)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${enabled ? 'btn-success' : 'btn-danger'} disabled:opacity-50`}
                  disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded}
                >
                  {wheel.toUpperCase()}: {enabled ? `${wheelSpeeds[wheel as keyof WheelSpeeds]}Hz` : 'OFF'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(wheelSpeeds).map(([wheel, speed]) => (
              <div key={wheel} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="input-label">
                    {wheel.toUpperCase()}: <span className="font-bold status-info">{speed} Hz</span>
                  </label>
                  <button
                    onClick={() => toggleWheelEnabled(wheel as keyof WheelSpeeds)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${wheelEnabled[wheel as keyof WheelSpeeds] ? 'btn-success' : 'btn-danger'}`}
                    disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded}
                  >
                    {wheelEnabled[wheel as keyof WheelSpeeds] ? 'ON' : 'OFF'}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max={maxSpeed}
                  value={speed}
                  onChange={(e) => handleIndividualWheelChange(wheel as keyof WheelSpeeds, parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                  disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded || !wheelEnabled[wheel as keyof WheelSpeeds]}
                />
              </div>
            ))}
          </div>
        )}

        {!isAutoTesting && !isPlayingRecorded && (
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 rounded-lg border border-blue-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-800 dark:text-white">
                Manual Frequency Control
              </label>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{frequency} Hz</span>
            </div>
            <input
              type="range"
              min="0"
              max={maxFrequency}
              value={frequency}
              onChange={handleFrequencyChange}
              className="w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
              disabled={!isConnectedToDevice || isRecording}
            />
            <div className="flex justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span>0 Hz</span>
              <span>{maxFrequency} Hz</span>
            </div>
          </div>
        )}
      </div>

      {/* Test Controls */}
      <div className="mt-6 space-y-3">
        {(isAutoTesting || isPlayingRecorded) && (
          <div className="text-center p-4 bg-blue-50 dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-gray-600">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Test in Progress</p>
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {formatTime(remainingTime)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={toggleAutoTest}
            className={`px-4 py-3 rounded-lg shadow-md font-medium flex items-center justify-center transition-all text-sm ${isAutoTesting ? 'btn-danger hover:shadow-lg' : 'btn-primary hover:shadow-lg'} disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!isConnectedToDevice || isPlayingRecorded || profileEditorOpen}
          >
            {isAutoTesting ? <PauseIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
            {isAutoTesting ? 'Stop Profile Test' : 'Run Profile Test'}
          </button>

          <button
            className={`px-4 py-3 rounded-lg shadow-md font-medium flex items-center justify-center transition-all text-sm ${isHardwareTesting ? 'btn-danger hover:shadow-lg' : 'btn-success hover:shadow-lg'} disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded || profileEditorOpen}
            onClick={() => {
              setIsHardwareTesting(!isHardwareTesting);
              sendMessage(JSON.stringify({ type: 13, id: Date.now() % 1000 }));
            }}
          >
            {isHardwareTesting ? <PauseIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
            {isHardwareTesting ? 'Stop Hardware Test' : 'Hardware Auto Test'}
          </button>
        </div>

        <button
          onClick={() => setProfileEditorOpen(!profileEditorOpen)}
          className="w-full btn-secondary text-sm py-2.5 disabled:opacity-50 shadow hover:shadow-md transition-all"
          disabled={isAutoTesting || isPlayingRecorded}
        >
          {profileEditorOpen ? '✕ Close Profile Editor' : '⚙ Edit Test Profile'}
        </button>
      </div>

      {/* Profile Editor Section */}
      {profileEditorOpen && (
        <div className="mt-6 card">
          <h3 className="card-header">Test Profile Editor</h3>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
            <div className="flex items-center">
              <select
                className="input-field block w-full sm:w-auto text-sm mr-3"
                value={selectedProfileId || ''}
                onChange={(e) => loadProfile(e.target.value)}
                disabled={isLoadingProfiles}
              >
                {isLoadingProfiles ? (
                  <option>Loading profiles...</option>
                ) : profiles.length === 0 ? (
                  <option>No profiles available</option>
                ) : (
                  profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))
                )}
              </select>
              <button onClick={saveProfile} className="btn-success text-sm font-medium">
                Save Current
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={addProfilePoint} className="btn-primary text-sm font-medium">
                Add Point
              </button>
              <button
                onClick={removeProfilePoint}
                className="btn-danger text-sm font-medium disabled:opacity-50"
                disabled={editingPoint === null || activeProfile.length <= 2}
              >
                Remove Point
              </button>
            </div>
          </div>

          <div className="relative w-full h-64 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-inner">
            <canvas
              ref={profileCanvasRef}
              className="w-full h-full cursor-crosshair"
              onClick={handleProfileCanvasClick}
            />
          </div>
          <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            <p>Click on points to select, then click elsewhere on the graph to move the selected point. Click empty space to add a new point.</p>
            <p>X-axis: Time (0-15s), Y-axis: Frequency (0-{maxFrequency}Hz).</p>
          </div>
        </div>
      )}

      {/* Record and Play Custom Profile Section */}
      <div className="mt-6 card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Recording Studio</h3>
          {recordedProfile.length > 0 && !isRecording && (
            <span className="text-xs px-2.5 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full font-medium">
              {recordedProfile.length} points • {recordedProfile.length > 1 ? recordedProfile[recordedProfile.length-1].time.toFixed(1) : '0.0'}s
            </span>
          )}
        </div>

        {isRecording && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Recording in progress... {recordingStartTimeRef.current !== null ? ((Date.now() - recordingStartTimeRef.current) / 1000).toFixed(1) : '0.0'}s
              </span>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1 ml-5">
              Adjust the frequency slider above to create your custom profile
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={toggleRecording}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center shadow-md transition-all ${isRecording ? 'bg-red-600 hover:bg-red-700 text-white hover:shadow-lg' : 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg'} disabled:opacity-50`}
            disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded || profileEditorOpen}
          >
            <ArrowPathIcon className={`w-4 h-4 mr-2 ${isRecording ? 'animate-spin' : ''}`} />
            {isRecording ? 'Stop' : 'Record'}
          </button>

          {!isPlayingRecorded ? (
            <button
              onClick={playRecordedProfile}
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
              disabled={!isConnectedToDevice || recordedProfile.length < 2 || isRecording || isAutoTesting || profileEditorOpen}
            >
              <PlayIcon className="w-4 h-4 mr-2" /> Play
            </button>
          ) : (
            <button
              onClick={stopPlayingRecorded}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
              disabled={!isConnectedToDevice}
            >
              <PauseIcon className="w-4 h-4 mr-2" /> Stop
            </button>
          )}

          <button
            onClick={saveRecordedProfile}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
            disabled={recordedProfile.length < 2 || isRecording || isPlayingRecorded}
          >
            💾 Save
          </button>
        </div>

        {!isRecording && recordedProfile.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
            Click Record, then adjust the frequency slider to create a custom test profile
          </p>
        )}
      </div>
    </div>
  );
}
