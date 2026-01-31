const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const configPath = path.join(__dirname, '../config.js');

try {
    if (!fs.existsSync(envPath)) {
        console.error("Error: .env file not found at", envPath);
        process.exit(1);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);

    if (match && match[1]) {
        const apiKey = match[1].trim();
        const jsContent = `const CONFIG = {\n    GEMINI_API_KEY: "${apiKey}"\n};\n`;

        fs.writeFileSync(configPath, jsContent);
        console.log("✅ config.js generated via .env successfully!");
    } else {
        console.error("Error: GEMINI_API_KEY not found in .env");
    }
} catch (e) {
    console.error("Build Error:", e);
}
