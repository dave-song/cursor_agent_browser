const STORAGE_KEY = "openai_api_key";

const apiKeyInput = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const statusEl = document.getElementById("status");

// Set header logo (extension asset URL)
const logoEl = document.getElementById("agent-logo");
if (logoEl) logoEl.src = chrome.runtime.getURL("images/sunset_logo.svg");

function showStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status";
}

// Load existing key from storage when popup opens (show masked placeholder if set)
chrome.storage.local.get([STORAGE_KEY], (result) => {
  if (result[STORAGE_KEY]) {
    apiKeyInput.placeholder = "•••••••••••• (saved)";
  }
});

saveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("Enter an API key to save.", "error");
    return;
  }

  saveBtn.disabled = true;
  clearStatus();

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: key });
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "•••••••••••• (saved)";
    showStatus("Saved.", "success");
  } catch (e) {
    showStatus("Failed to save: " + e.message, "error");
  } finally {
    saveBtn.disabled = false;
  }
});
