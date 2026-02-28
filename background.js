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

const STORAGE_API_KEY = "openai_api_key";

async function getApiKey() {
  const result = await chrome.storage.local.get([STORAGE_API_KEY]);
  if (result[STORAGE_API_KEY]) return result[STORAGE_API_KEY];
  if (typeof CONFIG !== "undefined" && CONFIG.OPENAI_API_KEY) return CONFIG.OPENAI_API_KEY;
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "QUERY_AI") {
    (async () => {
      const apiKey = await getApiKey();
      if (!apiKey) {
        sendResponse({ result: "Error: API key missing. Open the extension (click the icon) and add your OpenAI API key in Settings." });
        return;
      }

      const userMessage = `
      CONTEXT:
      ${request.context}
      
      USER QUERY:
      ${request.prompt}
    `;

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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
        });
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        const answer = data.choices[0].message.content;
        sendResponse({ result: answer });
      } catch (error) {
        console.error("Cursor Agent Error:", error);
        sendResponse({
          result:
            "Sorry, I encountered an error talking to the AI. Check the console.",
        });
      }
    })();
    return true; // Keep the message channel open for async sendResponse
  }
});
