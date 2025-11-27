# cursor_agent_browser
A cursor-first AI interaction layer for the web. Replaces static sidebars with context-aware, DOM-injected agent bubbles using Manifest V3.


# Cursor Agent: Software Structures for UI

**Status:** Proof of Concept (Final Project P4)  
**Author:** Dave Seung Heon Song  
**Date:** Nov 2025

## 📖 Project Overview
[cite_start]Current AI browsers force users to break their flow by moving to a fixed right-side chat UI[cite: 5]. [cite_start]This project implements a **cursor-first interaction model**, injecting intelligence directly into the user's existing web workflow[cite: 10].

[cite_start]Instead of a persistent sidebar, this Chrome Extension spawns a compact input bubble near the pointer, captures local page context, and renders results in a lightweight, floating popover[cite: 6, 7].

## ✨ Key Features

### 1. The Interaction Model
* **Smart Activation:** Triggered via `Space + /` (chord). Short press for text, long press (>500ms) for voice input.
* **Context Aware:** The bubble spawns at the cursor location. [cite_start]It can capture specific element text via selection or **Drag-and-Drop** interactions.
* [cite_start]**Visual Isolation:** Uses **Shadow DOM** to inject UI elements (bubbles, popovers, cursors) without inheriting or breaking the host website's CSS.

### 2. The Agentic Interface
* [cite_start]**Input Bubble:** A minimal text entry that mimics Figma's UI, allowing for rapid querying.
* **Result Popovers:** Lightweight cards that display summaries or answers. [cite_start]These can be **pinned** to the screen for reference or **minimized** to save space.
* [cite_start]**Agent Cursor:** A secondary visual pointer that highlights specific DOM elements referenced by the AI's analysis[cite: 15].

### 3. Intelligence
* [cite_start]**Context injection:** Automatically scrapes relevant page text (or video transcripts on YouTube) to use as LLM context.
* **Powered by OpenAI:** Uses `gpt-4o-mini` (or similar) via a Background Service Worker to process requests securely.

## 🛠 Tech Stack

* **Runtime:** Chrome Extension (Manifest V3)
* **Core Logic:** Vanilla JavaScript (ES6+)
* **UI Architecture:** Shadow DOM & Custom Elements
* **Styling:** CSS3 (Variables & Flexbox)
* **AI Backend:** OpenAI API (via Background Script fetch)

## 📂 Project Structure

```text
cursor-agent/
├── manifest.json        # Extension configuration & permissions
├── background.js        # Service Worker (API calls & CORS handling)
├── content.js           # DOM manipulation, Event Listeners, Input Bubble logic
├── styles.css           # UI styling (injected into Shadow Root)
├── icons/               # App icons
└── README.md            # Documentation
