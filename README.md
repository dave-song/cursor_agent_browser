# Karet: cursor_agent_browser

Chrome Extension:

A cursor-first AI interaction layer for the web. Replaces static sidebars with context-aware, DOM-injected agent bubbles using Manifest V3.

# Software Structures for UI P4

**Status:** Proof of Concept (Final Project P4)  
**Author:** Dave Song  
**Date:** Nov - Dec 2025

## Project Overview

Recently, there has been significant media coverage regarding the rise of AI browsers. However, from a **Human-AI** interaction standpoint, current designs often force users to break their usual flow by diverting attention to a fixed, right-side chat UI. Through this project, I wanted to question this existing design language. What if the experience was more subtle and adaptive to the user's workflow, without overtly signaling the presence of AI?

In this vein, this project explores a **cursor-first interaction model**, injecting intelligence directly into the user's existing workflow as a Chrome Extension.

Instead of a persistent sidebar, **this extension spawns a compact input bubble near the pointer, captures local page context, and renders results in a lightweight, floating popover**.

Outside of scope but would like to build more to support:

- voice interaction with real time transcription
- web search results via agent
- various model selections
- agent characteristics
- local model optoins for enhanced security

## Key Features

### 1. Basic Interactions

- **Karet Activation:** Triggered via `Option + K`. Short press for text, long press (>500ms) for voice input (the actual voice real time transcription is not within the project scope but what I would love to work on later).
- **Context Aware:** The bubble spawns at the cursor location. It can capture specific element text via selection. By default, it generally can view what the page is displaying.
- **Visual Isolation:** Uses **Shadow DOM** to inject UI elements (bubbles, popovers, cursors) without inheriting or breaking the host website's CSS.

### 2. The Interface

- **Input Bubble:** A minimal text entry UI, allowing for fast querying.
- **Context Bubble:** A small UI bubble displaying what the user selected from the page to ask questions about.
- **Result Popovers:** Lightweight cards that display summaries or answers.

### 3. Intelligence

- **Context injection:** Automatically scrapes relevant page text (or video transcripts on YouTube) to use as LLM context.
- **Powered by OpenAI:** Uses `gpt-4o-mini` (for SSUI class demo) via a Background Service Worker (aka background.js) to process requests securely.

## Tech Stack

- **Runtime:** Chrome Extension (Manifest V3)
- **Core Logic:** Vanilla JavaScript
- **UI Architecture:** Shadow DOM & Custom Elements
- **Styling:** CSS
- **AI Backend:** OpenAI API (via Background Script fetch). [Out of scope, but later I would like to host own local model for security]

## How to Run Karet

- Since it's an experimental Chrome Extension, you will need to download the files
- Navigate to the root directory of the project
- Creat a file named `config.js`
- Inside the file, enter your OpenAI API Key

```const CONFIG = {
    OPENAI_API_KEY:
    "YOUR OPENAI_API_KEY_HERE",
    };
```

- Once you have the files ready, navigate to `chrome://extensions`.
- In the top right corner of the page, toggle the page into developer mode.
- Once you are in Dev mode, click `Load Unpacked` and select the project file with a valid config.js file in.
- Open the project file. You will see additional Chrome Extension named Karet loaded in the list.
- From here, enable the extention and then open a new tab with an article.
- Use `Option + K` shorcut to call Karet.
