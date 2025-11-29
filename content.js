console.log("Cursor Agent: Content script ready.");

// --- Global State ---
let shadowHost = null;
let shadowRoot = null;
let mouseX = 0;
let mouseY = 0;
let spacePressedTime = 0;
let isSpacePressed = false;
let voiceTimer = null;

// --- Mouse Tracking ---
// We need this to spawn the bubble exactly where the user is looking
document.addEventListener("mousemove", (event) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
});

// --- Keyboard Interaction (The "Chord" Logic) ---
document.addEventListener("keydown", (event) => {
  // 1. Safety Check: Don't trigger if user is typing in a form
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }

  // 2. Track Space Bar
  if (event.code === "Space" && !event.repeat) {
    isSpacePressed = true;
    spacePressedTime = Date.now();
  }

  // 3. Detect "Space + /"
  if (event.code === "Slash" && isSpacePressed) {
    event.preventDefault(); // Stop "/" from printing
    event.stopPropagation();

    // Determine Mode: Text vs Voice
    // If Space was held down for > 500ms before pressing /, assume Voice Intent
    // (Or you can implement a hold-delay on the Slash key itself)
    const duration = Date.now() - spacePressedTime;

    // For this PoC, we will trigger Text Mode immediately on press.
    // Voice mode can be toggled inside the UI or via long-press logic here.
    spawnBubble(mouseX, mouseY);
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "Space") isSpacePressed = false;
});

// --- Core UI Functions ---

function spawnBubble(x, y) {
  if (shadowHost) {
    // If already open, close it (toggle behavior)
    closeBubble();
    return;
  }

  // 1. Capture Context (Selection or Page Text)
  const contextData = captureContext();

  // 2. Create Shadow Host
  shadowHost = document.createElement("div");
  shadowHost.id = "cursor-agent-host";

  // Position it near the cursor (clamped to viewport to prevent overflow)
  const spawnX = Math.min(x + 20, window.innerWidth - 350);
  const spawnY = Math.min(y + 20, window.innerHeight - 400);

  shadowHost.style.cssText = `
    position: fixed;
    top: ${spawnY}px;
    left: ${spawnX}px;
    z-index: 2147483647; /* Max Z-Index */
    font-family: sans-serif;
  `;

  // 3. Attach Shadow DOM
  shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // 4. Inject External Styles (from styles.css)
  const styleLink = document.createElement("link");
  styleLink.setAttribute("rel", "stylesheet");
  styleLink.setAttribute("href", chrome.runtime.getURL("styles.css"));
  shadowRoot.appendChild(styleLink);

  // 5. Build UI Structure
  const container = document.createElement("div");
  container.className = "agent-bubble";
  container.innerHTML = `
    <div class="bubble-header">
      <span class="agent-icon">✨</span>
      <span class="agent-title">Cursor Agent</span>
      <button class="close-btn">&times;</button>
    </div>
    
    ${
      contextData.hasSelection
        ? `
      <div class="context-pill">
        <span class="pill-label">Context:</span>
        <span class="pill-text">${truncate(contextData.text, 30)}</span>
      </div>
    `
        : ""
    }

    <div class="input-area">
      <textarea id="agent-input" rows="1" placeholder="Ask AI..."></textarea>
      <button id="mic-btn">🎤</button>
    </div>
    
    <div id="agent-result" class="result-area hidden">
      <div class="loading-spinner hidden">Thinking...</div>
      <div class="markdown-content"></div>
    </div>
  `;

  shadowRoot.appendChild(container);
  document.body.appendChild(shadowHost);

  // 6. Setup Event Listeners inside Shadow DOM
  setupBubbleListeners(shadowRoot, contextData);
}

function closeBubble() {
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
  }
}

function captureContext() {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0) {
    return { hasSelection: true, text: selection, type: "selection" };
  }
  // Fallback: Grab the first 5000 chars of visible text
  return {
    hasSelection: false,
    text: document.body.innerText.slice(0, 5000),
    type: "page",
  };
}

function setupBubbleListeners(root, contextData) {
  const input = root.getElementById("agent-input");
  const resultArea = root.getElementById("agent-result");
  const contentArea = resultArea.querySelector(".markdown-content");
  const spinner = resultArea.querySelector(".loading-spinner");
  const closeBtn = root.querySelector(".close-btn");

  // Auto-focus input
  input.focus();

  // Close Button
  closeBtn.addEventListener("click", closeBubble);

  // Handle Enter Key
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) return;

      // UI Updates
      resultArea.classList.remove("hidden");
      spinner.classList.remove("hidden");
      contentArea.innerHTML = ""; // Clear previous

      // Send to Background Script
      try {
        const response = await chrome.runtime.sendMessage({
          type: "QUERY_AI",
          prompt: prompt,
          context: contextData.text,
        });

        spinner.classList.add("hidden");
        contentArea.innerText = response.result || "No response received.";
      } catch (error) {
        spinner.classList.add("hidden");
        contentArea.innerText = "Error: " + error.message;
      }
    }
  });

  // Drag and Drop Logic (Feature D.2)
  const container = root.querySelector(".agent-bubble");
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    container.style.border = "2px dashed #007bff";
  });

  container.addEventListener("dragleave", (e) => {
    container.style.border = "none";
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.style.border = "none";
    const droppedText = e.dataTransfer.getData("text");
    if (droppedText) {
      // Update context data locally
      contextData.text = droppedText;
      contextData.hasSelection = true;
      // Visual feedback
      input.value += ` [Context: ${droppedText.slice(0, 15)}...] `;
    }
  });
}

// Utility
function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "..." : str;
}
