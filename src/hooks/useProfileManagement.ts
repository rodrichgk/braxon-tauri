import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

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

export function useProfileManagement() {
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfilePoint[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [editingPoint, setEditingPoint] = useState<number | null>(null);

  const fetchProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const response = await fetch('/api/profiles');
      if (!response.ok) {
        throw new Error('Failed to fetch profiles');
      }
      const data = await response.json();
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
  }, [selectedProfileId]);

  const saveProfile = useCallback(async () => {
    const profileName = prompt("Enter a name for this profile:", selectedProfileName);
    if (!profileName) return;
    
    try {
      if (selectedProfileId) {
        const response = await fetch(`/api/profiles/${selectedProfileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: profileName,
            points: activeProfile
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update profile');
        }
        
        toast.success('Profile updated successfully');
      } else {
        const response = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: profileName,
            points: activeProfile
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create profile');
        }
        
        toast.success('Profile created successfully');
      }
      
      await fetchProfiles();
      setSelectedProfileName(profileName);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save profile');
    }
  }, [selectedProfileId, selectedProfileName, activeProfile, fetchProfiles]);

  const loadProfile = useCallback((profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setActiveProfile(JSON.parse(profile.points));
      setSelectedProfileName(profile.name);
      setSelectedProfileId(profile.id);
      setEditingPoint(null);
    }
  }, [profiles]);

  const addProfilePoint = useCallback((maxFrequency: number) => {
    const newPoint: ProfilePoint = { time: 7.5, frequency: maxFrequency / 2 };
    setActiveProfile(prev => [...prev, newPoint]);
    setEditingPoint(activeProfile.length);
  }, [activeProfile.length]);

  const removeProfilePoint = useCallback(() => {
    if (editingPoint !== null && activeProfile.length > 2) {
      const newProfile = activeProfile.filter((_, i) => i !== editingPoint);
      setActiveProfile(newProfile);
      setEditingPoint(null);
    }
  }, [editingPoint, activeProfile]);

  const updateProfilePoint = useCallback((index: number, point: ProfilePoint) => {
    const newProfile = [...activeProfile];
    newProfile[index] = point;
    setActiveProfile(newProfile.sort((a, b) => a.time - b.time));
  }, [activeProfile]);

  useEffect(() => {
    fetchProfiles();
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
    updateProfilePoint
  };
}
