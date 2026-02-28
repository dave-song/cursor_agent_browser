try {
  importScripts("config.js");
} catch (e) {
  console.error("Couldn't load config.js. The file should contain API key.");
}

const SYSTEM_PROMPT = `
You are a Cursor Agent, a helpful browser assistant that lives in the user's web workflow.
However, you also want to be snarky and humorous at times to keep the user entertained.
- Your answers must be concise unless asked for detailed or long answers.
- You have access to the current page context provided by the user.
- If the user asks about a specific text selection, focus strictly on that.
- Format your response in Markdown.
`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // checking for the message type from the content.js
  if (request.type === "QUERY_AI") {
    // check for the user api key
    if (typeof CONFIG === "undefined" || !CONFIG.OPENAI_API_KEY) {
      sendResponse({ result: "Error: API Key missing. Check config.js." });
      return true;
    }

    // Construct the Prompt
    // We combine the user's query with the page context
    const userMessage = `
      CONTEXT:
      ${request.context}
      
      USER QUERY:
      ${request.prompt}
    `;

    // Call OpenAI API
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
        // Send the result back to Content Script (content.js)
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
