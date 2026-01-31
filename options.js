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
            const l = items.weights.labour || 50;
            const e = items.weights.env || 50;
            const a = items.weights.animals || 50;

            document.getElementById('weight-labour').value = l;
            document.getElementById('val-labour').textContent = l;

            document.getElementById('weight-env').value = e;
            document.getElementById('val-env').textContent = e;

            document.getElementById('weight-animals').value = a;
            document.getElementById('val-animals').textContent = a;
        }
    });
});
