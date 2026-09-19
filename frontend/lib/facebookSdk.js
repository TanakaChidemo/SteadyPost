// Facebook Login for Business only shows its Page/asset picker through the
// JS SDK's FB.login() — a plain server-side redirect to the OAuth dialog
// never surfaces that step. This lazily loads the SDK once and resolves
// with the global `FB` object.
let sdkPromise = null;

export function loadFacebookSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK can only load in the browser"));
  }
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) {
    return Promise.reject(new Error("NEXT_PUBLIC_META_APP_ID is not configured"));
  }

  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function fbAsyncInit() {
      window.FB.init({ appId, xfbml: false, version: "v20.0" });
      resolve(window.FB);
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load the Facebook SDK"));
    document.body.appendChild(script);
  });

  return sdkPromise;
}
