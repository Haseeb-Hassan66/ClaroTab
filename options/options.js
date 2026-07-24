import { getApiKey, setApiKey, clearApiKey } from "../src/settings/apiKey.js";
import { testApiKey, getOrderedModels } from "../src/categorize/gemini.js";
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

    // Uses the exact same ordering logic that actually runs during
    // categorization, so this can never say something different from what
    // ClaroTab is really doing.
    const chain = await getOrderedModels();
    const activeModel = chain[0];

    modelList.innerHTML = "";
    modelList.appendChild(buildAutoRow(preferredModel, activeModel));

    for (const modelId of MODEL_FALLBACK_CHAIN) {
        modelList.appendChild(
            buildModelRow(modelId, usageMap[modelId], preferredModel === modelId, modelId === activeModel)
        );
    }
}

function buildAutoRow(preferredModel, activeModel) {
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
    // Only meaningful to show "currently using X" when Automatic is actually
    // the active mode -- if a model is pinned, that choice is what governs.
    status.textContent = isSelected
        ? `Currently using ${MODEL_META[activeModel].displayName}. Switches automatically if it runs low.`
        : "ClaroTab picks the best available model and switches automatically if one runs low.";

    info.append(name, status);
    row.append(radio, info);
    return row;
}

function buildModelRow(modelId, usage, isSelected, isActive) {
    const meta = MODEL_META[modelId];
    const { count, exhausted } = usage;

    const row = document.createElement("label");
    row.className = [
        "model-row",
        isSelected && "model-row-selected",
        exhausted && "model-row-disabled",
        isActive && !isSelected && "model-row-active", // only add the extra highlight when it's not already highlighted as pinned/selected
    ]
        .filter(Boolean)
        .join(" ");

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
    if (isActive) {
        const activeTag = document.createElement("span");
        activeTag.className = "model-row-tag model-row-tag-active";
        activeTag.textContent = "Active now";
        name.appendChild(activeTag);
    }
    if (isSelected) {
        const tag = document.createElement("span");
        tag.className = "model-row-tag";
        tag.textContent = "Pinned";
        name.appendChild(tag);
    }

    // Only real, locally-observed numbers here -- no estimated denominator
    // or percentage claim, since Google doesn't expose actual quota and an
    // earlier version of this UI shipped estimates that turned out badly
    // wrong in practice.
    const status = document.createElement("div");
    status.className = "model-row-status";

    const dot = document.createElement("span");
    dot.className = `usage-dot ${exhausted ? "usage-dot-exhausted" : count > 0 ? "usage-dot-used" : "usage-dot-unused"}`;

    // The request count gets its own badge, always visible regardless of
    // state -- previously it was buried inside the exhausted-state sentence,
    // easy to miss. Now it's equally prominent whether the model is fresh,
    // in use, or exhausted.
    const countBadge = document.createElement("span");
    countBadge.className = `usage-count ${exhausted ? "usage-count-exhausted" : ""}`;
    countBadge.textContent = `${count} request${count === 1 ? "" : "s"}`;

    const label = document.createElement("span");
    if (exhausted) {
        status.classList.add("status-exhausted");
        label.textContent = "Exhausted today — resets after midnight Pacific time";
    } else if (count > 0) {
        label.textContent = "used today";
    } else {
        label.textContent = "Not used today";
    }

    status.append(dot);
    if (count > 0) {
        status.appendChild(countBadge);
    }
    status.appendChild(label);

    info.append(name, status);
    row.append(radio, info);
    return row;
}

init();