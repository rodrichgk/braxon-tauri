import { useState, useEffect, useCallback } from 'react';

export interface ProfilePoint {
  time: number;
  frequency: number;
}

export interface ServerProfile {
  id: string;
  name: string;
  points: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'wss_hil_profiles';

function loadFromStorage(): ServerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ServerProfile[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(profiles: ServerProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch { /* storage full or unavailable — silently skip */ }
}

export function useProfileManagement() {
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfilePoint[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [editingPoint, setEditingPoint] = useState<number | null>(null);

  const fetchProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    const data = loadFromStorage();
    setProfiles(data);
    if (data.length > 0 && !selectedProfileId) {
      const first = data[0];
      setSelectedProfileId(first.id);
      setSelectedProfileName(first.name);
      try { setActiveProfile(JSON.parse(first.points)); } catch { /* malformed */ }
    }
    setIsLoadingProfiles(false);
  }, [selectedProfileId]);

  const saveProfile = useCallback(async () => {
    const profileName = prompt('Enter a name for this profile:', selectedProfileName);
    if (!profileName) return;

    const now = new Date().toISOString();
    const existing = loadFromStorage();

    if (selectedProfileId) {
      const updated = existing.map(p =>
        p.id === selectedProfileId
          ? { ...p, name: profileName, points: JSON.stringify(activeProfile), updatedAt: now }
          : p
      );
      saveToStorage(updated);
      setProfiles(updated);
      setSelectedProfileName(profileName);
    } else {
      const newProfile: ServerProfile = {
        id: crypto.randomUUID(),
        name: profileName,
        points: JSON.stringify(activeProfile),
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...existing, newProfile];
      saveToStorage(updated);
      setProfiles(updated);
      setSelectedProfileId(newProfile.id);
      setSelectedProfileName(profileName);
    }
  }, [selectedProfileId, selectedProfileName, activeProfile]);

  const loadProfile = useCallback((profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try { setActiveProfile(JSON.parse(profile.points)); } catch { /* malformed */ }
    setSelectedProfileName(profile.name);
    setSelectedProfileId(profile.id);
    setEditingPoint(null);
  }, [profiles]);

  const addProfilePoint = useCallback((maxFrequency: number) => {
    setActiveProfile(prev => {
      setEditingPoint(prev.length);
      return [...prev, { time: 7.5, frequency: Math.round(maxFrequency / 2) }];
    });
  }, []);

  const removeProfilePoint = useCallback(() => {
    if (editingPoint !== null && activeProfile.length > 2) {
      setActiveProfile(activeProfile.filter((_, i) => i !== editingPoint));
      setEditingPoint(null);
    }
  }, [editingPoint, activeProfile]);

  const updateProfilePoint = useCallback((index: number, point: ProfilePoint) => {
    setActiveProfile(prev => {
      const next = [...prev];
      next[index] = point;
      return next.sort((a, b) => a.time - b.time);
    });
  }, []);

  useEffect(() => {
    fetchProfiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    profiles,
    activeProfile,
    setActiveProfile,
    selectedProfileName,
    selectedProfileId,
    isLoadingProfiles,
    editingPoint,
    setEditingPoint,
    fetchProfiles,
    saveProfile,
    loadProfile,
    addProfilePoint,
    removeProfilePoint,
    updateProfilePoint,
  };
}
