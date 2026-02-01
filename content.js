// Content script to scrape product info

function getPageContent() {
    // Simple heuristic: Get the visible text of the body, 
    // focusing on main content areas if possible, or just the top generic tags.

    // A naive but effective approach for LLMs: Dump the text.
    // We can limit it to the first N characters to save tokens.
    const bodyText = document.body.innerText;

    // Clean up excessive whitespace
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();

    return cleanText.substring(0, 15000); // Limit to ~15k chars to fit context window easily
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_product_data") {
        const data = {
            url: window.location.href,
            title: document.title,
            content: getPageContent(),
            looksLikeClothingStore: checkIsClothingStore()
        };
        sendResponse(data);
    }
});

function checkIsClothingStore() {
    const text = document.body.innerText.toLowerCase();
    const clothingKeywords = [
        "basket",
        "cart",
        "size",
        "colour",
        "color",
        "fabric",
        "fit",
        "model wears",
        "material",
        "bag",
        "shoes",
        "accessories"
    ];

    let matchCount = 0;
    clothingKeywords.forEach(k => {
        if (text.includes(k)) matchCount++;
    });

    return matchCount >= 3;
}
