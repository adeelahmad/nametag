/**
 * Client-side feature flags
 * Fetches available providers from the server
 */

let cachedProviders: { google: boolean } | null = null;

export async function fetchAvailableProviders(): Promise<{ google: boolean }> {
  if (cachedProviders) {
    return cachedProviders;
  }

  try {
    const response = await fetch('/api/auth/available-providers');
    const data = await response.json();
    cachedProviders = data.providers;
    return cachedProviders!;
  } catch (error) {
    console.error('Failed to fetch available providers:', error);
    return { google: false };
  }
}
