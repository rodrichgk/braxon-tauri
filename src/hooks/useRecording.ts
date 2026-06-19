import { useState, useRef, useCallback } from 'react';
import { ProfilePoint } from './useProfileManagement';

const STORAGE_KEY = 'wss_hil_profiles';

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedProfile, setRecordedProfile] = useState<ProfilePoint[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);

  const startRecording = useCallback(() => {
    recordingStartTimeRef.current = null;
    setRecordedProfile([]);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((currentFrequency: number) => {
    const elapsedSeconds = recordingStartTimeRef.current
      ? (Date.now() - recordingStartTimeRef.current) / 1000
      : 0;

    setRecordedProfile(prev => {
      const lastPoint = prev[prev.length - 1];
      if (lastPoint && lastPoint.frequency === 0 && currentFrequency === 0) return prev;
      return [...prev, {
        time: Math.max(elapsedSeconds, prev[prev.length - 1]?.time || 0),
        frequency: currentFrequency,
      }];
    });
    setIsRecording(false);
  }, []);

  const addRecordingPoint = useCallback((frequency: number) => {
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
  }, [isRecording]);

  const saveRecordedProfile = useCallback(async (name: string) => {
    if (recordedProfile.length < 2 || !name.trim()) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing: unknown[] = raw ? JSON.parse(raw) : [];
      const now = new Date().toISOString();
      const newProfile = {
        id: crypto.randomUUID(),
        name: name.trim(),
        points: JSON.stringify(recordedProfile),
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, newProfile]));
    } catch (err) {
      console.error('Error saving recorded profile:', err);
    }
  }, [recordedProfile]);

  const clearRecording = useCallback(() => {
    setRecordedProfile([]);
    recordingStartTimeRef.current = null;
  }, []);

  return {
    isRecording,
    recordedProfile,
    recordingStartTimeRef,
    startRecording,
    stopRecording,
    addRecordingPoint,
    saveRecordedProfile,
    clearRecording,
  };
}
