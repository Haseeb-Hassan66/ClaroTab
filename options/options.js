import { getApiKey, setApiKey, clearApiKey } from "../src/settings/apiKey.js";
import { testApiKey } from "../src/categorize/gemini.js";

const input = document.getElementById("api-key-input");
const toggleVisibilityBtn = document.getElementById("toggle-visibility-btn");
const saveBtn = document.getElementById("save-btn");
const removeBtn = document.getElementById("remove-btn");
const statusBadge = document.getElementById("status-badge");
const feedback = document.getElementById("feedback");

async function init() {
    const existingKey = await getApiKey();
    input.value = existingKey;
    updateStatusBadge(Boolean(existingKey));
}

function updateStatusBadge(isConfigured) {
    statusBadge.textContent = isConfigured ? "AI categorization: on" : "AI categorization: off";
    statusBadge.className = `status-badge ${isConfigured ? "status-configured" : "status-not-configured"}`;
}

function showFeedback(message, isError) {
    feedback.textContent = message;
    feedback.className = `feedback ${isError ? "error" : "success"}`;
}

toggleVisibilityBtn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    toggleVisibilityBtn.textContent = isHidden ? "Hide" : "Show";
});

saveBtn.addEventListener("click", async () => {
    const key = input.value.trim();

    if (!key) {
        showFeedback("Enter a key before saving.", true);
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Testing…";
    showFeedback("Verifying your key with Google's API…", false);

    const result = await testApiKey(key);

    if (!result.ok) {
        showFeedback(result.message, true);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save & Test";
        return;
    }

    await setApiKey(key);
    updateStatusBadge(true);
    showFeedback(result.message, false);
    saveBtn.disabled = false;
    saveBtn.textContent = "Save & Test";
});

removeBtn.addEventListener("click", async () => {
    await clearApiKey();
    input.value = "";
    updateStatusBadge(false);
    showFeedback("API key removed. AI categorization is now off.", false);
});

init();