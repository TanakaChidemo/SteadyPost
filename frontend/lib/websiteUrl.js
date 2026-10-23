// Clients usually type "mybusiness.com" — store it as "https://mybusiness.com",
// matching how the backend's website fetcher reads a bare domain.
export function normaliseWebsiteUrl(value) {
  const url = value.trim();
  if (!url) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

// Props for a website box. Not type="url": the browser's url check rejects
// "mybusiness.com", which is how most people type it.
export const websiteInputProps = {
  type: "text",
  inputMode: "url",
  autoComplete: "url",
  autoCapitalize: "none",
  spellCheck: false,
};
