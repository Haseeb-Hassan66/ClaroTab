import { getApiKey, setApiKey, clearApiKey } from "../src/settings/apiKey.js";
import { testApiKey } from "../src/categorize/gemini.js";
import { MODEL_FALLBACK_CHAIN, MODEL_META } from "../src/categorize/models.js";
import { getUsageMap, getPreferredModel, setPreferredModel } from "../src/settings/modelUsage.js";

const input = document.getElementById("api-key-input");
const toggleVisibilityBtn = document.getElementById("toggle-visibility-btn");
const saveBtn = document.getElementById("save-btn");
const removeBtn = document.getElementById("remove-btn");
const statusBadge = document.getElementById("status-badge");
const feedback = document.getElementById("feedback");
const modelList = document.getElementById("model-list");
const refreshUsageBtn = document.getElementById("refresh-usage-btn");

async function init() {
    const existingKey = await getApiKey();
    input.value = existingKey;
    updateStatusBadge(Boolean(existingKey));
    await renderModelList();
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

// --- AI model list ---

refreshUsageBtn.addEventListener("click", renderModelList);

async function renderModelList() {
    const [usageMap, preferredModel] = await Promise.all([getUsageMap(), getPreferredModel()]);

    modelList.innerHTML = "";
    modelList.appendChild(buildAutoRow(preferredModel));

    for (const modelId of MODEL_FALLBACK_CHAIN) {
        modelList.appendChild(buildModelRow(modelId, usageMap[modelId], preferredModel === modelId));
    }
}

function buildAutoRow(preferredModel) {
    const isSelected = preferredModel === null;

    const row = document.createElement("label");
    row.className = `model-row${isSelected ? " model-row-selected" : ""}`;

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "model-choice";
    radio.checked = isSelected;
    radio.addEventListener("change", async () => {
        await setPreferredModel(null);
        await renderModelList();
    });

    const info = document.createElement("div");
    info.className = "model-row-info";

    const name = document.createElement("div");
    name.className = "model-row-name";
    name.textContent = "Automatic (recommended)";

    const status = document.createElement("div");
    status.className = "model-row-status";
    status.textContent = "ClaroTab picks the best available model and switches automatically if one runs low.";

    info.append(name, status);
    row.append(radio, info);
    return row;
}

function buildModelRow(modelId, usage, isSelected) {
    const meta = MODEL_META[modelId];
    const { count, exhausted } = usage;
    const estimatedLimit = meta.estimatedDailyLimit;
    const percentUsed = Math.min(100, Math.round((count / estimatedLimit) * 100));

    const row = document.createElement("label");
    row.className = `model-row${isSelected ? " model-row-selected" : ""}${exhausted ? " model-row-disabled" : ""}`;

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "model-choice";
    radio.checked = isSelected;
    radio.disabled = exhausted; // can't pin a model that's already known to be out of quota today
    radio.addEventListener("change", async () => {
        await setPreferredModel(modelId);
        await renderModelList();
    });

    const info = document.createElement("div");
    info.className = "model-row-info";

    const name = document.createElement("div");
    name.className = "model-row-name";
    name.textContent = meta.displayName;
    if (isSelected) {
        const tag = document.createElement("span");
        tag.className = "model-row-tag";
        tag.textContent = "Pinned";
        name.appendChild(tag);
    }

    const status = document.createElement("div");
    status.className = exhausted ? "model-row-status status-exhausted" : "model-row-status";
    status.textContent = exhausted
        ? "Exhausted today — resets after midnight Pacific time"
        : `~${count} of ~${estimatedLimit} requests used today (estimated)`;

    const gaugeTrack = document.createElement("div");
    gaugeTrack.className = "gauge-track";
    const gaugeFill = document.createElement("div");
    gaugeFill.className = `gauge-fill ${exhausted ? "gauge-exhausted" : percentUsed >= 70 ? "gauge-low" : "gauge-ok"}`;
    gaugeFill.style.width = `${exhausted ? 100 : percentUsed}%`;
    gaugeTrack.appendChild(gaugeFill);

    info.append(name, status, gaugeTrack);
    row.append(radio, info);
    return row;
}

init();