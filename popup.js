const SUPABASE_URL = 'https://hayugyyspjrrsqfzagta.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheXVneXlzcGpycnNxZnphZ3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODg1NTgsImV4cCI6MjA4NTQ2NDU1OH0.PufQYgSw29I1ySra0dyD239wKFaRsHM0P4RmA5Bl2bg';

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

    document.getElementById('retry-btn').addEventListener('click', () => startAnalysisFlow());
    document.getElementById('start-btn').addEventListener('click', () => startAnalysisFlow());

    // History Features
    document.getElementById('history-btn').addEventListener('click', toggleHistory);
    document.getElementById('close-history').addEventListener('click', toggleHistory);
    document.getElementById('history-overlay').addEventListener('click', toggleHistory);
    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);

    init();
});

function init() {
    // Check for API Key but don't start yet
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (!result.geminiApiKey) {
            showView('setup-required');
        } else {
            showView('start-view');
        }
    });
}

function startAnalysisFlow(bypassCache = false) {
    chrome.storage.local.get(['geminiApiKey', 'weights'], (result) => {
        const apiKey = result.geminiApiKey;
        const weights = result.weights || { labour: 50, env: 50, animals: 50 };
        startAnalysis(apiKey, weights, bypassCache);
    });
}

function startAnalysis(apiKey, weights, bypassCache = false) {
    console.log("startAnalysis called. Bypass:", bypassCache);
    showView('loading');

    // Get Active Tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            showError("No active tab found.");
            return;
        }

        // Setup Link in UI early if we have URL (best effort)
        const currentUrl = tabs[0].url;
        document.getElementById('product-link').href = currentUrl;
        document.getElementById('product-link').textContent = "Analyzing...";

        const tabId = tabs[0].id;

        // Functional wrapper to run the scraping
        const executeScrape = () => {
            chrome.tabs.sendMessage(tabId, { action: "get_product_data" }, (response) => {
                if (chrome.runtime.lastError) {
                    // If content script is missing, we might need to inject it or just fail gracefully
                    console.warn(chrome.runtime.lastError);
                    showError("Could not connect to page. Try manually refreshing.");
                    return;
                }

                if (response && response.content) {
                    // Logic to handle cache/API
                    const cleanUrl = getCleanUrl(response.url);
                    console.log("Clean URL:", cleanUrl);
                    const cacheKey = `analysis_v3_${cleanUrl}`;

                    if (!bypassCache) {
                        chrome.storage.local.get([cacheKey], async (cacheResult) => {
                            if (cacheResult[cacheKey]) {
                                console.log("Cache hit for:", cleanUrl);
                                renderResults(cacheResult[cacheKey]);
                                return;
                            }

                            // Level 2: Check Cloud Database
                            if (typeof checkCloudDatabase === 'function') {
                                const cloudResult = await checkCloudDatabase(cleanUrl);
                                if (cloudResult) {
                                    console.log("Cloud DB hit for:", cleanUrl);
                                    // Save to local for faster next access
                                    chrome.storage.local.set({ [cacheKey]: cloudResult });
                                    renderResults(cloudResult);
                                    return;
                                }
                            }

                            // Miss: Call API
                            analyzeWithGemini(apiKey, weights, response.content, cleanUrl);
                        });
                    } else {
                        analyzeWithGemini(apiKey, weights, response.content, cleanUrl);
                    }
                } else {
                    showError("Could not extract content from this page.");
                }
            });
        };

        // RELOAD logic (Requested by user)
        // We reload the tab, wait for complete, then scrape.
        chrome.tabs.reload(tabId, {}, () => {
            if (chrome.runtime.lastError) {
                showError("Cannot reload this page.");
                return;
            }

            // Wait for reload to finish
            chrome.tabs.onUpdated.addListener(function listener(tid, info) {
                if (tid === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    // Give it a small delay for DOM to settle
                    setTimeout(executeScrape, 1000);
                }
            });
        });
    });
}

async function analyzeWithGemini(apiKey, weights, pageContent, cleanUrl) {
    console.log("analyzeWithGemini called for:", cleanUrl);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const cacheKey = `analysis_v3_${cleanUrl}`;

    const prompt = `
    You are wearFair, an ethical shopping assistant. Analyze the product details below and calculate raw ethical scores for three categories.
    
    Product Context (scraped text):
    """${pageContent.substring(0, 10000)}""" 
    
    Task:
    1. Identify the EXACT Product Name (short and concise, avoid extra keywords).
    2. Rate it on a scale of 0-100 for Labour, Environment, and Animals based on available information (use general brand knowledge if specific details are missing).
       - 0 = Unethical / No Info / Bad
       - 100 = Perfect / Certified Ethical
    3. Provide a SHORT 1-sentence thought/reasoning.
    4. Suggest 2 better ethical alternatives if average score is likely < 80. If high ethical standards, return an EMPTY array [].
       IMPORTANT: Alternatives must be the SAME specific product type (e.g. if analyzing a blazer, suggest ONLY blazers, not socks or general clothing).
       For alternatives, provide the "name" and a valid "url".
       CRITICAL URL RULES:
       - Use the OFFICIAL brand homepage if you are not 100% sure of the product link.
       - DO NOT GUESS top-level domains (e.g. do NOT guess .eu or .de). Use .com if unsure.
       - Verify the link is not a gambling/spam site if possible.

    Return ONLY VALID JSON in this format:
    {
        "name": "string",
        "breakdown": { "labour": number, "environment": number, "animals": number },
        "reasoning": "string",
        "alternatives": [{ "name": "string", "url": "string" }]
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

        // Save to cache
        if (cleanUrl) {
            const cacheKey = `analysis_v3_${cleanUrl}`;
            chrome.storage.local.set({ [cacheKey]: result });

            // Save to Cloud DB (Fire and forget)
            console.log("Attempting to call saveToCloud...");
            if (typeof saveToCloud === 'function') {
                saveToCloud(cleanUrl, result);
            } else {
                console.error("saveToCloud is NOT a function");
            }
        }

        // VERIFY LINKS (Security check)
        if (result.alternatives && result.alternatives.length > 0) {
            // Show a temporary status? Or just wait.
            // Since we want to be safe, we wait.
            const verifiedAlts = await verifyAlternatives(result.alternatives);
            result.alternatives = verifiedAlts;
        }

        renderResults(result);

    } catch (e) {
        console.error(e);
        showError("AI Analysis Failed: " + e.message);
    }
}

async function verifyAlternatives(alts) {
    const verified = [];

    // Process in parallel
    const checks = alts.map(async (alt) => {
        if (typeof alt !== 'object' || !alt.url) return null;

        try {
            // Fetch the page metadata (timeout 3s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const resp = await fetch(alt.url, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'User-Agent': 'wearFair/1.0' }
            });
            clearTimeout(timeoutId);

            if (!resp.ok) return null; // Link broken

            // Basic content check (read first 5000 chars)
            const text = await resp.text();
            const startContent = text.substring(0, 5000).toLowerCase();

            // 1. Gambling/Spam Blocklist
            const blocklist = ['casino', 'betting', 'gambling', 'slots', 'poker', 'lottery', 'domain for sale', 'buy this domain', 'investing.com', 'sedo', 'godaddy'];
            const suspicious = blocklist.some(word => startContent.includes(word));

            if (suspicious) {
                console.warn(`Blocked suspicious link: ${alt.url}`);
                return null;
            }

            // 2. Metadata Name Match (Optional but safer)
            // Extract <title>
            const titleMatch = startContent.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1] : "";
            console.log(`Verified: ${alt.name} -> ${title}`);

            // If it passes checks, keep it
            return alt;

        } catch (e) {
            console.warn(`Failed to verify link ${alt.url}:`, e);
            // If we cant verify it, strict mode says drop it, 
            // but loose mode says keep it. 
            // Given the user's specific complaint about gambling, 
            // we should probably err on the side of dropping BROKEN/TIMEOUT links,
            // but keeping valid http ones that just timed out might be risky.
            // Let's drop if verification failed entirely to be safe.
            return null;
        }
    });

    const results = await Promise.all(checks);
    return results.filter(r => r !== null);
}

function calculateScore(breakdown, weights) {
    const l = Number(weights.labour);
    const e = Number(weights.env);
    const a = Number(weights.animals);
    const totalWeight = l + e + a;

    if (totalWeight === 0) return 0; // Avoid divide by zero

    const weightedSum = (breakdown.labour * l) +
        (breakdown.environment * e) +
        (breakdown.animals * a);

    console.log(`Scoring Breakdown:
    Labour: ${breakdown.labour} (Score) x ${l} (Weight) = ${breakdown.labour * l}
    Environment: ${breakdown.environment} (Score) x ${e} (Weight) = ${breakdown.environment * e}
    Animals: ${breakdown.animals} (Score) x ${a} (Weight) = ${breakdown.animals * a}
    --------------------------------------------------
    Sum: ${(breakdown.labour * l) + (breakdown.environment * e) + (breakdown.animals * a)}
    Total Weight: ${totalWeight}
    Final Score: ${Math.round(((breakdown.labour * l) + (breakdown.environment * e) + (breakdown.animals * a)) / totalWeight)}`);

    return Math.round(weightedSum / totalWeight);
}

function getCleanUrl(url) {
    try {
        const u = new URL(url);
        // Remove query parameters to prevent tracking info from being part of the key
        // e.g. amazon.com/dp/B000?ref=... -> amazon.com/dp/B000
        return `${u.hostname}${u.pathname}`;
    } catch (e) {
        return url;
    }
}

// --- History Logic ---

function toggleHistory() {
    const panel = document.getElementById('history-panel');
    const overlay = document.getElementById('history-overlay');
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
    } else {
        panel.classList.add('open');
        overlay.classList.add('visible');
        renderHistory();
    }
}

function clearHistory() {
    if (!confirm("Are you sure you want to clear your local history?")) return;

    chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(k => k.startsWith('analysis_v3_'));
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {
                renderHistory(); // Update UI
            });
        }
    });
}

function renderHistory() {
    chrome.storage.local.get(null, (items) => {
        const list = document.getElementById('history-list');
        list.innerHTML = '';

        const historyItems = Object.keys(items)
            .filter(k => k.startsWith('analysis_v3_'))
            .map(k => {
                const data = items[k];
                return {
                    key: k,
                    name: data.name || "Unknown Product",
                    // Estimate score if missing (legacy)
                    score: data.breakdown ? Math.round((data.breakdown.labour + data.breakdown.environment + data.breakdown.animals) / 3) : '?',
                    url: k.replace('analysis_v3_', ''),
                    data: data
                };
            });

        if (historyItems.length === 0) {
            list.innerHTML = '<li style="padding:10px; color:#999; text-align:center;">No history yet check back later!</li>';
            return;
        }

        historyItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';

            li.innerHTML = `
                <div class="history-name">${item.name}</div>
                <div class="history-score">${item.score}</div>
            `;

            li.addEventListener('click', () => {
                renderResults(item.data);
                if (item.data.name) {
                    // Update UI immediately since we have data
                    document.getElementById('product-link').textContent = item.data.name;
                    document.getElementById('product-link').href = `https://${item.url}`; // Simple reconstruction
                }
                toggleHistory(); // Close panel
            });

            list.appendChild(li);
        });
    });
}

function renderResults(data) {
    showView('results');

    // Update Product Name
    const nameEl = document.getElementById('product-link');
    nameEl.textContent = data.name || "Product Name";
    // If URL is missing in data, we can't set href perfectly without context, 
    // but typically renderResults is called after analysis which knows the URL.
    // We'll leave href as # if unknown, or set it if we have it.

    // Calculate Score Locally based on current weights
    chrome.storage.local.get(['weights'], (res) => {
        const weights = res.weights || { labour: 50, env: 50, animals: 50 };

        // Handle case where we might have legacy cached data (pre-v3) that still has a 'score'
        // But since we versioned to v3, 'data' should be the new format (breakdown only).
        // However, if calculateScore returns NaN (e.g. data.breakdown missing), handle safely.
        let finalScore = 0;
        if (data.breakdown) {
            finalScore = calculateScore(data.breakdown, weights);
        } else if (data.score) {
            // Fallback for any old data if it sneaks in
            finalScore = Math.round(data.score);
        }

        document.getElementById('score-value').textContent = finalScore;
        let verdict = "Neutral";
        if (finalScore >= 80) verdict = "Excellent";
        else if (finalScore >= 50) verdict = "Average";
        else verdict = "Poor";
        document.getElementById('score-verdict').textContent = verdict;
    });

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

            // Handle both object {name, url} and simpler string formats just in case
            if (typeof alt === 'object' && alt.name) {
                const a = document.createElement('a');
                a.href = alt.url || '#';
                a.textContent = alt.name;
                a.target = "_blank"; // Open in new tab
                a.style.color = 'var(--primary-dark)';
                a.style.textDecoration = 'none';
                a.style.fontWeight = '500';
                a.addEventListener('mouseenter', () => a.style.textDecoration = 'underline');
                a.addEventListener('mouseleave', () => a.style.textDecoration = 'none');

                li.appendChild(a);
            } else {
                li.textContent = alt;
            }
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>No better alternatives found.</li>';
    }
}

function showView(id) {
    ['start-view', 'loading', 'setup-required', 'results', 'error-view'].forEach(viewId => {
        document.getElementById(viewId).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

function showError(msg) {
    showView('error-view');
    document.getElementById('error-msg').textContent = msg;
}

// --- Cloud Database Helpers ---

async function checkCloudDatabase(cleanUrl) {
    try {
        const encodedUrl = encodeURIComponent(cleanUrl);
        // GET /rest/v1/products?url=eq.URL
        const response = await fetch(`${SUPABASE_URL}/rest/v1/products?url=eq.${encodedUrl}&select=*`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data && data.length > 0) {
            const row = data[0];
            // Map DB row back to our extension format
            return {
                name: row.name, // NEW
                breakdown: {
                    labour: row.labour_score,
                    environment: row.env_score,
                    animals: row.animal_score
                },
                reasoning: row.reasoning,
                alternatives: row.alternatives || []
            };
        }
    } catch (e) {
        console.warn("Cloud DB Check Failed:", e);
    }
    return null;
}

async function saveToCloud(cleanUrl, result) {
    console.log("saveToCloud FUNCTION START for:", cleanUrl);
    try {
        const payload = {
            url: cleanUrl,
            name: result.name || "Unknown Product", // NEW
            labour_score: result.breakdown.labour,
            env_score: result.breakdown.environment,
            animal_score: result.breakdown.animals,
            reasoning: result.reasoning,
            alternatives: result.alternatives
        };

        const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates' // Upsert behavior if supported or just ignore error
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("Saved to Cloud DB:", cleanUrl);
        } else {
            console.warn("Failed to save to Cloud DB:", await response.text());
        }
    } catch (e) {
        console.error("Cloud Save Error:", e);
    }
}
