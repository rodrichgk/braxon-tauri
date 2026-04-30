// API client for connecting to the Next.js server

// Configure your server URL here
// Your Next.js server is running on 192.168.77.182:8443 (HTTPS with nginx)
const DEFAULT_SERVER_URL = 'https://192.168.77.182:8443';

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Make HTTP request to the server API
 * Uses Tauri's HTTP client for CORS-free requests
 */
async function apiRequest(endpoint: string, options: FetchOptions = {}) {
  try {
    const serverUrl = getServerUrl();
    const url = `${serverUrl}${endpoint}`;
    
    // Use Tauri's HTTP client (requires http-all permission in tauri.conf.json)
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// ABS Data API
export async function fetchABSData() {
  return apiRequest('/api/abs-data');
}

export async function searchABSData(query: string) {
  return apiRequest(`/api/abs-data/search?q=${encodeURIComponent(query)}`);
}

export async function createABSData(data: any) {
  return apiRequest('/api/abs-data', {
    method: 'POST',
    body: data,
  });
}

export async function updateABSData(id: string, data: any) {
  return apiRequest(`/api/abs-data/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteABSData(id: string) {
  return apiRequest(`/api/abs-data/${id}`, {
    method: 'DELETE',
  });
}

// Test Profiles API
export async function fetchProfiles() {
  return apiRequest('/api/profiles');
}

export async function createProfile(profile: any) {
  return apiRequest('/api/profiles', {
    method: 'POST',
    body: profile,
  });
}

export async function updateProfile(id: string, profile: any) {
  return apiRequest(`/api/profiles/${id}`, {
    method: 'PUT',
    body: profile,
  });
}

export async function deleteProfile(id: string) {
  return apiRequest(`/api/profiles/${id}`, {
    method: 'DELETE',
  });
}

// Motor Tests API
export async function fetchMotorTests() {
  return apiRequest('/api/motor-tests');
}

export async function createMotorTest(test: any) {
  return apiRequest('/api/motor-tests', {
    method: 'POST',
    body: test,
  });
}

// Configuration
export function setServerUrl(url: string) {
  // Store in localStorage or Tauri store
  localStorage.setItem('serverUrl', url);
}

export function getServerUrl(): string {
  return localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL;
}
