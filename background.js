// This is the service worker. It runs in the background, separate from any tab or popup.
// Chrome starts it up when something relevant happens (extension installed, tab events, etc.)
// and shuts it down when it's idle to save resources.

chrome.runtime.onInstalled.addListener(() => {
  console.log("ClaroTab installed.");
});
