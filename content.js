console.log("Cursor Agent: Content script ready.");

// Global States and variables
let shadowHost = null;
let shadowRoot = null;
let mouseX = 0;
let mouseY = 0;
let shortcutPressTime = 0;
let shortcutPressed = false;
let cursorFollowEnabled = true;
let isDragging = false;
let mouseOverBubble = false;
let bubbleWidth = 380;
let bubbleHeight = 260;
let isResizing = false;

// [to be implemented] For voice recording features.
// whisper api does not provide a good UX. Looking into ways to incorporate real time
// transcription into input box as user speaks.
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentMode = "text";

// Mouse Tracking
// For tracking user cursor locations
document.addEventListener("mousemove", (event) => {
  //get the cursor pointer coordinates
  mouseX = event.clientX;
  mouseY = event.clientY;

  if (shadowHost && shadowHost.isConnected && cursorFollowEnabled && !mouseOverBubble && !isDragging && !isResizing) {
    updateBubblePosition(mouseX, mouseY);
  }
});

// Keyboard Interaction (Option + K with hold detection)
document.addEventListener(
  "keydown",
  (event) => {
    // Detect Option+K for mac Alt + k for windows
    if (event.code === "KeyK" && event.altKey && !event.repeat) {
      console.log("Cursor Agent: Alt+K detected on keydown");
      // Prevent default browser behavior and preventing bubble inputs from interacting
      // with the page elements.
      // websites like youtube with lots of shortcuts will break if I don't have this.
      event.preventDefault();
      event.stopPropagation();

      // Record the time when first pressed
      if (!shortcutPressed) {
        shortcutPressed = true;
        // start recording the time
        // [to be implemented] for longer press, voice mode will be activated.
        shortcutPressTime = Date.now();
      }
    }
  },
  { capture: true } // to capture keydown event globally before bublbing phase
);

// for when the user releases the shortcut
document.addEventListener(
  "keyup",
  (event) => {
    // When K key is released
    if (event.code === "KeyK" && shortcutPressed) {
      console.log("Cursor Agent: K key released");
      // same logic here as above
      event.preventDefault();
      event.stopPropagation();

      // subtracting time to measure how long the user pressed the shorcut
      // longer press above 500ms means voice input mode. [to be implemented]
      const holdDuration = Date.now() - shortcutPressTime;
      shortcutPressed = false; // resetting the flag

      // If bubble is already open, close it
      if (shadowHost && shadowHost.isConnected) {
        console.log("Cursor Agent: Closing bubble");
        // removes the bubble UI from the DOM
        closeBubble();
      } else {
        // Determine mode based on hold duration
        // Hold > 500ms = Voice mode, otherwise = Text mode
        const mode = holdDuration > 500 ? "voice" : "text";
        console.log(
          // for debugging
          `Cursor Agent: Opening bubble in ${mode} mode (held for ${holdDuration}ms)`
        );
        // making the bubble once the key is up.
        spawnBubble(mouseX, mouseY, mode);
      }
    }
  },
  { capture: true } // to capture keydown event globally before bublbing phase
);

// Core UI Functions
function spawnBubble(x, y, mode = "text") {
  if (shadowHost) {
    // If already open, close it. like a toggle
    closeBubble();
    return;
  }

  const cursorUrl = chrome.runtime.getURL("images/agent_cursor.svg");
  document.body.style.cursor = `url('${cursorUrl}') 12 12, crosshair`;

  cursorFollowEnabled = true;
  isDragging = false;
  isResizing = false;

  const contextData = captureContext();

  // Create Shadow DOM for the actual AI bubble UI
  // followed the example from google;s AI overview.
  shadowHost = document.createElement("div");
  shadowHost.id = "cursor-agent-host";

  // Position it near the cursor (clamped to viewport to prevent overflow)
  updateBubblePosition(x, y);

  // creating what's called "shadow root" for styling and isolation from environment pages.
  shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // copied from Google's AI overview on how to inject external styles.
  const styleLink = document.createElement("link");
  styleLink.setAttribute("rel", "stylesheet");
  styleLink.setAttribute("href", chrome.runtime.getURL("styles.css"));
  shadowRoot.appendChild(styleLink);

  // BUILDING: actual UI element for the bubble.
  const container = document.createElement("div");
  container.className = "agent-bubble agent-bubble-glass";
  container.innerHTML = `
    <div class="bubble-header">
      <div class="agent-brand">
        <span class="agent-icon"><img src="${chrome.runtime.getURL(
          "images/sunset_logo.svg"
        )}" alt="Agent Icon"></span>
        <span class="agent-title">Karet.</span>
      </div>
      <span class = "mode-label">Mode</span>
      <span class="mode-badge ${
        mode === "voice" ? "voice-mode" : "text-mode"
      }"> ${mode === "voice" ? "🎤 Voice" : "⌨️ Text"}</span>
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

    <div class="shortcut-buttons">
      <button class="shortcut-btn" id="summarize-btn">
        <span class="shortcut-label">Summarize</span>
      </button>
      <button class="shortcut-btn" id="refine-btn">
        <span class="shortcut-label">Refine</span>
      </button>
    </div>

    <div class="input-area">
      <textarea id="agent-input" rows="1" placeholder="${
        mode === "voice"
          ? "🎤 Hold Cmd+K for voice (coming soon)..."
          : "Ask Karet..."
      }" ${mode === "voice" ? "disabled" : ""}></textarea>
      <button id="mic-btn" ${
        mode === "voice" ? 'class="active"' : ""
      }>🎤</button>
    </div>
    
    <div id="agent-result" class="result-area hidden">
      <div class="loading-spinner hidden">Thinking...</div>
      <div class="markdown-content"></div>
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  `;

  // attaching the ui element above to the shadow root.
  shadowRoot.appendChild(container);
  document.body.appendChild(shadowHost);

  // setting up bubble listener for the UI element
  setupBubbleListeners(shadowRoot, contextData, mode);
}

// helper for closing down the agent bubble
function closeBubble() {
  if (shadowHost) {
    // Stop voice recording if active
    if (mediaRecorder && isRecording) {
      try {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
      mediaRecorder = null;
      audioChunks = [];
      isRecording = false;
    }

    // remove the bubbel from DOM
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;

    // Restore default cursor from custom cursor to default one.
    document.body.style.cursor = "";
  }
}

function updateBubblePosition(x, y) {
  if (!shadowHost) return;
  if (!cursorFollowEnabled) return;

  const offsetX = 20;
  const offsetY = 20;
  const spawnX = Math.max(0, Math.min(x + offsetX, window.innerWidth - bubbleWidth));
  const spawnY = Math.max(0, Math.min(y + offsetY, window.innerHeight - bubbleHeight));

  shadowHost.style.cssText = `
    position: fixed;
    top: ${spawnY}px;
    left: ${spawnX}px;
    width: ${bubbleWidth}px;
    height: ${bubbleHeight}px;
    z-index: 1000;
    font-family: sans-serif;
    transition: top 0.1s ease-out, left 0.1s ease-out;
  `;
}

// helper function for capturing more context about the page or user's selection.
function captureContext() {
  // checking and getting user's selection using .getselection method. + trimming
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

// Setting up eventListeners and logic for the karet bubble ui
function setupBubbleListeners(root, contextData, mode) {
  const input = root.getElementById("agent-input");
  const resultArea = root.getElementById("agent-result");
  const contentArea = resultArea.querySelector(".markdown-content");
  const spinner = resultArea.querySelector(".loading-spinner");
  const closeBtn = root.querySelector(".close-btn");
  const contextPill = root.querySelector(".context-pill");
  const micBtn = root.getElementById("mic-btn");
  const modeBadge = root.querySelector(".mode-badge");
  const summarizeBtn = root.getElementById("summarize-btn");
  const refineBtn = root.getElementById("refine-btn");
  const agentBrand = root.querySelector(".agent-brand");
  const agentIconImg = agentBrand ? agentBrand.querySelector(".agent-icon img") : null;
  const container = root.querySelector(".agent-bubble");

  container.style.width = bubbleWidth + "px";
  container.style.height = bubbleHeight + "px";
  container.style.boxSizing = "border-box";

  const LOGO_URL = chrome.runtime.getURL("images/sunset_logo.svg");
  const PIN_ICON_URL = chrome.runtime.getURL("images/pin_icon.svg");

  if (container) {
    container.addEventListener("mouseenter", () => { mouseOverBubble = true; });
    container.addEventListener("mouseleave", () => { mouseOverBubble = false; });
  }

  const setLogoIcon = (pinned) => {
    if (!agentIconImg) return;
    agentIconImg.src = pinned ? PIN_ICON_URL : LOGO_URL;
    agentIconImg.alt = pinned ? "Pinned – drag to move" : "Agent Icon";
    if (agentBrand) agentBrand.classList.toggle("pinned", !cursorFollowEnabled);
  };

  if (agentBrand && agentIconImg) {
    agentBrand.setAttribute("title", "Click to pin in place; drag to move");

    agentBrand.addEventListener("mouseenter", () => {
      if (isDragging) return;
      if (!cursorFollowEnabled) return;
      agentIconImg.src = PIN_ICON_URL;
    });
    agentBrand.addEventListener("mouseleave", () => {
      if (isDragging) return;
      if (cursorFollowEnabled) agentIconImg.src = LOGO_URL;
    });

    let didDrag = false;
    const DRAG_THRESHOLD_PX = 5;

    agentBrand.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      didDrag = false;
      if (cursorFollowEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      const rect = shadowHost.getBoundingClientRect();
      let startX = e.clientX;
      let startY = e.clientY;
      let startLeft = rect.left;
      let startTop = rect.top;
      const prevTransition = shadowHost.style.transition;
      shadowHost.style.transition = "none";

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) didDrag = true;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - bubbleWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - bubbleHeight));
        shadowHost.style.left = newLeft + "px";
        shadowHost.style.top = newTop + "px";
        startLeft = newLeft;
        startTop = newTop;
        startX = moveEvent.clientX;
        startY = moveEvent.clientY;
      };
      const onUp = () => {
        isDragging = false;
        shadowHost.style.transition = prevTransition || "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setTimeout(() => { didDrag = false; }, 0);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    agentBrand.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDragging || didDrag) return;
      cursorFollowEnabled = !cursorFollowEnabled;
      setLogoIcon(!cursorFollowEnabled);
      agentBrand.setAttribute("title", cursorFollowEnabled ? "Click to pin in place; drag to move" : "Drag to move · click to unpin");
    });
  }

  // Set initial mode
  currentMode = mode;

  // Enable input in voice mode initially
  if (mode === "voice") {
    input.disabled = false;
    input.placeholder = "Click 🎤 to record, or type for text mode";
  }

  // Autofocus input
  input.focus();

  // Function to update mode badge
  const updateModeBadge = (newMode) => {
    currentMode = newMode;
    if (newMode === "voice") {
      modeBadge.className = "mode-badge voice-mode";
      modeBadge.innerHTML = "🎤 Voice";
    } else {
      modeBadge.className = "mode-badge text-mode";
      modeBadge.innerHTML = "⌨️ Text";
    }
  };

  // To be implemented (for the future beyond MVP): Mic with full integration
  // micBtn.addEventListener("click", () => {
  //   if (isRecording) {
  //     // Stop recording
  //     stopWhisperRecording(micBtn);
  //   } else {
  //     // Start recording and switch to voice mode
  //     updateModeBadge("voice");
  //     startWhisperRecording(input, micBtn);
  //   }
  // });

  // Summarize shortcut button
  summarizeBtn.addEventListener("click", async () => {
    // UI Updates: show result area and loading spinner
    resultArea.classList.remove("hidden");
    spinner.classList.remove("hidden");
    contentArea.innerHTML = "";

    // Send summarize request to Background Script
    try {
      const response = await chrome.runtime.sendMessage({
        type: "QUERY_AI",
        prompt: "Summarize",
        context: contextData.text,
      });

      spinner.classList.add("hidden");
      // Parse markdown response into HTML
      const rawHTMLParsed = marked.parse(
        response.result || "No response received."
      );
      const cleanedHTML = DOMPurify.sanitize(rawHTMLParsed);
      contentArea.innerHTML = cleanedHTML;
    } catch (error) {
      spinner.classList.add("hidden");
      contentArea.innerText = "Error: " + error.message;
    }
  });

  // Refine shortcut button (grammar check and refine text)
  refineBtn.addEventListener("click", async () => {
    // UI Updates: show result area and loading spinner
    resultArea.classList.remove("hidden");
    spinner.classList.remove("hidden");
    contentArea.innerHTML = "";

    // Send refine request to Background Script
    try {
      const response = await chrome.runtime.sendMessage({
        type: "QUERY_AI",
        prompt:
          "Please refine and grammar check the following text. Fix any spelling, grammar, punctuation errors and improve clarity while preserving the original meaning and tone. Return only the refined text.",
        context: contextData.text,
      });

      spinner.classList.add("hidden");
      // Parse markdown response into HTML
      const rawHTMLParsed = marked.parse(
        response.result || "No response received."
      );
      const cleanedHTML = DOMPurify.sanitize(rawHTMLParsed);
      contentArea.innerHTML = cleanedHTML;
    } catch (error) {
      spinner.classList.add("hidden");
      contentArea.innerText = "Error: " + error.message;
    }
  });

  // Input Click: Switch to Text Mode
  input.addEventListener("click", () => {
    if (currentMode === "voice" && !isRecording) {
      updateModeBadge("text");
      input.placeholder = "Ask Karet...";
      input.disabled = false;
    }
  });

  // Input Focus: Switch to Text Mode
  input.addEventListener("focus", () => {
    if (currentMode === "voice" && !isRecording && !programmaticFocus) {
      updateModeBadge("text");
      input.placeholder = "Ask Karet...";
    }
    // Reset flag after checking
    programmaticFocus = false;
  });

  // Start Typing: Switch to Text Mode
  input.addEventListener("keydown", (e) => {
    // If user starts typing in voice mode, switch to text
    if (currentMode === "voice" && !isRecording && e.key.length === 1) {
      updateModeBadge("text");
      input.placeholder = "Ask Karet...";
    }
  });

  // Stop all keyboard events from bubbling to the page
  container.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });
  container.addEventListener("keyup", (e) => {
    e.stopPropagation();
  });
  container.addEventListener("keypress", (e) => {
    e.stopPropagation();
  });

  // Monitor text selection on the page after bubble is open
  const selectionHandler = () => {
    const selection = window.getSelection().toString().trim();
    if (selection.length > 0) {
      // Update context data
      contextData.text = selection;
      contextData.hasSelection = true;
      contextData.type = "selection";

      // Show or update context pill
      updateContextPill(root, selection);

      console.log(
        "Cursor Agent: Context updated with selection:",
        selection.slice(0, 50) + "..."
      );
    }
  };

  // Listen for text selection (with debounce to avoid too many updates)
  let selectionTimeout;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(selectionHandler, 300);
  });

  // Resize handle
  const resizeHandle = root.querySelector(".resize-handle");
  if (resizeHandle) {
    const MIN_WIDTH = 320;
    const MIN_HEIGHT = 180;
    const MAX_WIDTH = 600;
    const MAX_HEIGHT = Math.max(500, Math.floor(window.innerHeight * 0.85));

    resizeHandle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      let startX = e.clientX;
      let startY = e.clientY;
      let startW = bubbleWidth;
      let startH = bubbleHeight;

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        let newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
        let newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH + dy));
        bubbleWidth = newW;
        bubbleHeight = newH;
        shadowHost.style.width = newW + "px";
        shadowHost.style.height = newH + "px";
        const containerEl = root.querySelector(".agent-bubble");
        if (containerEl) {
          containerEl.style.width = newW + "px";
          containerEl.style.height = newH + "px";
        }
      };
      const onUp = () => {
        isResizing = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // Close Button
  closeBtn.addEventListener("click", () => {
    // Clean up selection listener
    document.removeEventListener("selectionchange", selectionHandler);
    closeBubble();
  });

  // Handle Enter Key
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) return;

      // UI Updates: show result are and loading spinner ui
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
        // get raw markdown response from LLM and parse it into HTML
        const rawHTMLParsed = marked.parse(
          response.result || "No response received."
        );
        // apparently, I need to add security features to prevent XSS attacks?
        // learned this from Gemini
        const cleanedHTML = DOMPurify.sanitize(rawHTMLParsed);
        // now insert it into our DOM
        contentArea.innerHTML = cleanedHTML;
      } catch (error) {
        spinner.classList.add("hidden");
        contentArea.innerText = "Error: " + error.message;
      }
    }
  });

  // Drag and Drop Logic (same thing as context selection but wanted to try it out)
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
      contextData.text = droppedText;
      contextData.hasSelection = true;
      // Visual feedback
      input.value += ` [Context: ${droppedText.slice(0, 30)}...] `;
    }
  });
}

// Utility for truncating long text
function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "..." : str;
}

function updateContextPill(root, selectionText) {
  const container = root.querySelector(".agent-bubble");
  let contextPill = root.querySelector(".context-pill");

  // If context pill doesn't exist, create it
  if (!contextPill) {
    contextPill = document.createElement("div");
    contextPill.className = "context-pill";

    // Insert after header
    const header = container.querySelector(".bubble-header");
    header.insertAdjacentElement("afterend", contextPill);
  }

  // Update content with animation
  contextPill.style.animation = "pulse 0.3s ease-out";
  contextPill.innerHTML = `
    <span class="pill-label">📝 Context:</span>
    <span class="pill-text">${truncate(selectionText, 100)}</span>
    <button class="pill-clear" title="Clear context">×</button>
  `;

  // Add clear button handler
  const clearBtn = contextPill.querySelector(".pill-clear");
  clearBtn.addEventListener("click", () => {
    contextPill.remove();
  });

  // Reset animation
  setTimeout(() => {
    contextPill.style.animation = "";
  }, 300);
}

function createShortcutHint() {
  if (document.getElementById("cursor-agent-hint")) return;

  const hotkeyText = /Mac|iPhone|iPad/i.test(navigator.platform) ? "Option + K" : "Alt + K";

  const hint = document.createElement("div");
  hint.id = "cursor-agent-hint";
  hint.className = "cursor-agent-shortcut-hint";
  hint.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 12px !important;
    transform: translateY(-50%) !important;
    z-index: 1000 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 6px 8px !important;
    background: rgba(0, 0, 0, 0.06) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border-radius: 20px !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04) !important;
    pointer-events: auto !important;
    user-select: none !important;
    cursor: default !important;
    transition: border-radius 0.15s ease, padding 0.15s ease !important;
  `;
  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("images/agent_cursor.svg");
  img.alt = "Agent shortcut";
  img.style.cssText = "width: 20px !important; height: 20px !important; opacity: 0.6 !important; flex-shrink: 0 !important;";
  const span = document.createElement("span");
  span.className = "cursor-agent-hint-text";
  span.textContent = hotkeyText;
  span.style.cssText = "font-size: 12px !important; color: rgba(0,0,0,0.6) !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; white-space: nowrap !important; max-width: 0 !important; overflow: hidden !important; opacity: 0 !important; transition: max-width 0.2s ease, opacity 0.2s ease !important;";

  hint.appendChild(img);
  hint.appendChild(span);

  hint.addEventListener("mouseenter", () => {
    hint.style.borderRadius = "20px";
    hint.style.paddingLeft = "10px";
    hint.style.paddingRight = "10px";
    span.style.maxWidth = "120px";
    span.style.opacity = "1";
  });
  hint.addEventListener("mouseleave", () => {
    hint.style.paddingLeft = "8px";
    hint.style.paddingRight = "8px";
    span.style.maxWidth = "0";
    span.style.opacity = "0";
  });

  document.body.appendChild(hint);
}

createShortcutHint();
