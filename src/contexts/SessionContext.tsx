import { createContext, useContext, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export interface AppUser {
  id: string;
  name: string;
}

export interface RepairJob {
  id: string;
  jobNumber: string;
  userId: string;
  userName: string;
  absRef?: string;
  absRefId?: string;
  status: 'in_progress' | 'completed' | 'failed' | 'closed';
  notes?: string;
  startedAt: string;
  completedAt?: string;
  dtcs?: string;
}

interface SessionContextType {
  currentUser: AppUser | null;
  currentJob: RepairJob | null;
  isLoggedIn: boolean;
  isGuest: boolean;
  login: (name: string, password: string) => Promise<void>;
  loginAsGuest: () => void;
  register: (name: string, password: string) => Promise<AppUser>;
  logout: () => void;
  startJob: (jobNumber: string, absRef?: string, absRefId?: string) => Promise<void>;
  endJob: (status: 'completed' | 'failed', notes?: string) => Promise<void>;
  linkJobToRef: (absRef: string, absRefId: string) => Promise<void>;
  setCurrentJob: (job: RepairJob | null) => void;
}

const GUEST_ID = '__guest__';

const SessionContext = createContext<SessionContextType>({
  currentUser: null,
  currentJob: null,
  isLoggedIn: false,
  isGuest: false,
  login: async () => {},
  loginAsGuest: () => {},
  register: async () => ({ id: '', name: '' }),
  logout: () => {},
  startJob: async () => {},
  endJob: async () => {},
  linkJobToRef: async () => {},
  setCurrentJob: () => {},
});

const USER_KEY     = 'session_user_id';
const USER_NAME_KEY = 'session_user_name';
const EXPIRES_KEY  = 'session_expires_at';
const SESSION_TTL  = 8 * 60 * 60 * 1000; // 8 hours in ms

function clearStoredSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

function persistSession(user: AppUser) {
  localStorage.setItem(USER_KEY,      user.id);
  localStorage.setItem(USER_NAME_KEY, user.name);
  localStorage.setItem(EXPIRES_KEY,   String(Date.now() + SESSION_TTL));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const id      = localStorage.getItem(USER_KEY);
      const name    = localStorage.getItem(USER_NAME_KEY);
      const expires = localStorage.getItem(EXPIRES_KEY);
      if (!id || !name) return null;
      if (!expires || Date.now() > parseInt(expires, 10)) {
        clearStoredSession();
        return null;
      }
      return { id, name };
    } catch {
      return null;
    }
  });
  const [currentJob, setCurrentJob] = useState<RepairJob | null>(null);

  const login = async (name: string, password: string) => {
    const user = await invoke<AppUser>('login_user', { name, password });
    persistSession(user);
    setCurrentUser(user);
  };

  const register = async (name: string, password: string): Promise<AppUser> => {
    const user = await invoke<AppUser>('create_user', { name, password });
    persistSession(user);
    setCurrentUser(user);
    return user;
  };

  const loginAsGuest = () => {
    setCurrentUser({ id: GUEST_ID, name: 'Guest' });
    // Guest is never persisted to localStorage — always resets on next launch
  };

  const logout = () => {
    clearStoredSession();
    setCurrentUser(null);
    setCurrentJob(null);
  };

  const startJob = async (jobNumber: string, absRef?: string, absRefId?: string) => {
    if (!currentUser) throw new Error('Not logged in');
    const job = await invoke<RepairJob>('create_repair_job', {
      jobNumber,
      userId: currentUser.id,
      userName: currentUser.name,
      absRef: absRef ?? null,
      absRefId: absRefId ?? null,
    });
    setCurrentJob(job);
  };

  const endJob = async (status: 'completed' | 'failed', notes?: string) => {
    if (!currentJob) return;
    await invoke('update_repair_job', {
      id: currentJob.id,
      status,
      notes: notes ?? currentJob.notes ?? null,
      absRef: currentJob.absRef ?? null,
      absRefId: currentJob.absRefId ?? null,
    });
    setCurrentJob({ ...currentJob, status, notes: notes ?? currentJob.notes, completedAt: new Date().toISOString() });
  };

  const linkJobToRef = async (absRef: string, absRefId: string) => {
    if (!currentJob) return;
    await invoke('update_repair_job', {
      id: currentJob.id,
      status: currentJob.status,
      notes: currentJob.notes ?? null,
      absRef,
      absRefId,
    });
    setCurrentJob({ ...currentJob, absRef, absRefId });
  };

  const isGuest = currentUser?.id === GUEST_ID;

  return (
    <SessionContext.Provider value={{
      currentUser,
      currentJob,
      isLoggedIn: currentUser !== null,
      isGuest,
      login,
      loginAsGuest,
      register,
      logout,
      startJob,
      endJob,
      linkJobToRef,
      setCurrentJob,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
