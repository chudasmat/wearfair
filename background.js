// Background service worker
// Currently acts as a relay or holder for global state if needed.
// In MV3, this is ephemeral.

chrome.runtime.onInstalled.addListener(() => {
    console.log("wearFair extension installed.");
});

// Listener for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyze_product") {
        // This will be handled by the popup usually, or we can proxy the API call here 
        // to avoid CORS in some strict environments, though Gemini API supports CORS.
        console.log("Analysis requested for:", request.data);
    }
});
