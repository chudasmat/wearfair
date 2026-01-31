// Helper to update displayed values
function setupSlider(id, valId) {
    const slider = document.getElementById(id);
    const display = document.getElementById(valId);

    slider.addEventListener('input', () => {
        display.textContent = slider.value;
    });
}

// Save settings
document.getElementById('save-btn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value;
    const labour = document.getElementById('weight-labour').value;
    const env = document.getElementById('weight-env').value;
    const animals = document.getElementById('weight-animals').value;

    chrome.storage.local.set({
        geminiApiKey: apiKey,
        weights: {
            labour: labour, // Stored as string "0"-"100"
            env: env,
            animals: animals
        }
    }, () => {
        const status = document.getElementById('status');
        status.classList.add('visible');
        setTimeout(() => {
            status.classList.remove('visible');
        }, 2000);
    });
});

// Load settings
document.addEventListener('DOMContentLoaded', () => {
    setupSlider('weight-labour', 'val-labour');
    setupSlider('weight-env', 'val-env');
    setupSlider('weight-animals', 'val-animals');

    chrome.storage.local.get(['geminiApiKey', 'weights'], (items) => {
        if (items.geminiApiKey) {
            document.getElementById('apiKey').value = items.geminiApiKey;
        }
        if (items.weights) {
            // Default to 50 if missing
            const getVal = (v) => {
                // If it's a number (or string number), return it.
                if (v !== undefined && v !== null && !isNaN(v)) return v;
                // Otherwise (legacy strings 'High', 'Medium', etc.) force to 50
                return 50;
            };

            const l = getVal(items.weights.labour);
            const e = getVal(items.weights.env);
            const a = getVal(items.weights.animals);

            document.getElementById('weight-labour').value = l;
            document.getElementById('val-labour').textContent = l;

            document.getElementById('weight-env').value = e;
            document.getElementById('val-env').textContent = e;

            document.getElementById('weight-animals').value = a;
            document.getElementById('val-animals').textContent = a;
        }
    });
});

// Clear Cache
document.getElementById('clear-cache-btn').addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(k => k.startsWith('analysis_'));
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {
                const btn = document.getElementById('clear-cache-btn');
                const originalText = btn.textContent;
                btn.textContent = "Cleared!";
                setTimeout(() => btn.textContent = originalText, 2000);
            });
        } else {
            alert("Cache is already empty.");
        }
    });
});
