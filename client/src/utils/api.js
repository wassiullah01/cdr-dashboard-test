// Get API base URL from environment variable or use relative path for local dev
const getApiBaseUrl = () => {
  // Priority 1: Use environment variable if set (for Vercel or custom deployments)
  // Vite replaces this at build time, so it must be set during build
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Priority 2: Runtime detection - if we're not on localhost, we're in production
  // This handles cases where VITE_API_BASE_URL wasn't set in Vercel env vars
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If not localhost or 127.0.0.1, assume production and use deployed backend
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.')) {
      return 'https://cdr-dashboard-server.vercel.app';
    }
  }
  
  // Priority 3: Check Vite build mode (available at build time)
  if (import.meta.env.MODE === 'production') {
    return 'https://cdr-dashboard-server.vercel.app';
  }
  
  // Priority 4: Local development - use relative path (Vite proxy will handle it)
  return '';
};

export const API_BASE_URL = getApiBaseUrl();
export const apiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
};
