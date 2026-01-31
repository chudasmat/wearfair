document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.getElementById('settings-btn').addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    document.getElementById('go-to-settings').addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    document.getElementById('retry-btn').addEventListener('click', init);

    init();
});

function init() {
    // 1. Check for API Key
    chrome.storage.local.get(['geminiApiKey', 'weights'], (result) => {
        const apiKey = result.geminiApiKey;
        const weights = result.weights || { labour: 'High', env: 'Medium', animals: 'Medium' };

        if (!apiKey) {
            showView('setup-required');
            return;
        }

        startAnalysis(apiKey, weights);
    });
}

function startAnalysis(apiKey, weights) {
    showView('loading');

    // 2. Get Page Content
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            showError("No active tab found.");
            return;
        }

        try {
            chrome.tabs.sendMessage(tabs[0].id, { action: "get_product_data" }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script might not be loaded if it's a restricted page or waiting
                    console.error(chrome.runtime.lastError);
                    showError("Please refresh the page and try again.");
                    return;
                }

                if (response && response.content) {
                    analyzeWithGemini(apiKey, weights, response.content);
                } else {
                    showError("Could not extract content from this page.");
                }
            });
        } catch (e) {
            showError("Extension context invalidated. Reload extension.");
        }
    });
}

async function analyzeWithGemini(apiKey, weights, pageContent) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
    You are an Ethical Shopping Assistant. Analyze the product details below and calculate an ethical score.
    
    User Preferences (Weights 0-100):
    - Labour Rights: ${weights.labour || 50}/100 importance
    - Environment: ${weights.env || 50}/100 importance
    - Animal Welfare: ${weights.animals || 50}/100 importance

    Product Context (scraped text):
    """${pageContent.substring(0, 10000)}""" 
    
    Task:
    1. Identify the product.
    2. Rate it on a scale of 0-100 for Labour, Environment, and Animals based on available information (use general brand knowledge if specific details are missing).
    3. Calculate an overall Score (0-100) weighted by the user's preferences.
    4. Provide a SHORT 1-sentence thought/reasoning.
    5. Suggest 2 better ethical alternatives if score is < 80, else say "Good choice".

    Return ONLY VALID JSON in this format:
    {
        "score": number, 
        "breakdown": { "labour": number, "environment": number, "animals": number },
        "reasoning": "string",
        "alternatives": ["string", "string"]
    }
    `;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API Error: ${response.status} ${err}`);
        }

        const data = await response.json();

        // Parse Gemini Response
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) throw new Error("Empty response from AI");

        // Clean JSON markup if present (```json ... ```)
        const jsonStr = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const result = JSON.parse(jsonStr);

        renderResults(result);

    } catch (e) {
        console.error(e);
        showError("AI Analysis Failed: " + e.message);
    }
}

function renderResults(data) {
    showView('results');

    // Score
    document.getElementById('score-value').textContent = data.score;
    let verdict = "Neutral";
    if (data.score >= 80) verdict = "Excellent";
    else if (data.score >= 50) verdict = "Average";
    else verdict = "Poor";
    document.getElementById('score-verdict').textContent = verdict;

    // Breakdown
    document.getElementById('bar-labour').style.width = data.breakdown.labour + '%';
    document.getElementById('bar-environment').style.width = data.breakdown.environment + '%';
    document.getElementById('bar-animals').style.width = data.breakdown.animals + '%';

    // Reasoning
    document.getElementById('reasoning-text').textContent = data.reasoning;

    // Alternatives
    const list = document.getElementById('alternatives-list');
    list.innerHTML = '';
    if (data.alternatives && data.alternatives.length > 0) {
        data.alternatives.forEach(alt => {
            const li = document.createElement('li');
            li.textContent = alt;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>No specific alternatives found.</li>';
    }
}

function showView(id) {
    ['loading', 'setup-required', 'results', 'error-view'].forEach(viewId => {
        document.getElementById(viewId).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

function showError(msg) {
    showView('error-view');
    document.getElementById('error-msg').textContent = msg;
}
