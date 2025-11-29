try {
  importScripts("config.js");
} catch (e) {
  console.error(
    "Cursor Agent: Could not load config.js. Make sure it exists and contains your API key."
  );
}

const SYSTEM_PROMPT = `
You are a Cursor Agent, a helpful browser assistant that lives in the user's web workflow.
- Your answers must be concise unless asked for more.
- You have access to the current page context provided by the user.
- If the user asks about a specific text selection, focus strictly on that.
- Format your response in Markdown.
`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "QUERY_AI") {
    // 1. Verify Key exists
    if (!typeof CONFIG !== "undefined" && !CONFIG.OPENAI_API_KEY) {
      sendResponse({ result: "Error: API Key is missing. Check config.js." });
      return true;
    }

    // 2. Prepare the Prompt
    // We combine the user's query with the page context [cite: 151]
    const userMessage = `
      CONTEXT:
      ${request.context}
      
      USER QUERY:
      ${request.prompt}
    `;

    // 3. Call OpenAI API
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Fast and cheap model for this prototype
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 700,
        temperature: 0.7,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // 4. Send the result back to Content Script (content.js)
        const answer = data.choices[0].message.content;
        sendResponse({ result: answer });
      })
      .catch((error) => {
        console.error("Cursor Agent Error:", error);
        sendResponse({
          result:
            "Sorry, I encountered an error talking to the AI. Check the console.",
        });
      });

    return true; // Keep the message channel open for the async fetch
  }
});
