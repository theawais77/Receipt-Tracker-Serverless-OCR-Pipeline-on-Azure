// Calls Gemini Vision via the REST API (no SDK — stable and version-pinned).
// Sends the receipt image + a strict prompt, gets back structured JSON.

export interface ParsedReceipt {
    vendor: string | null;
    date: string | null;      // YYYY-MM-DD
    total: number | null;
    currency: string | null;  // ISO code or symbol
    category: string | null;  // best-guess: Food, Travel, Office, etc.
}

// Alias that always points to the current Flash model — vision-capable,
// fast, cheap. Using the alias avoids breakage when a version is retired.
const MODEL = "gemini-flash-latest";

const PROMPT = `You are a receipt parser. Read this receipt image and return ONLY valid JSON with these keys:
- vendor (string): store/merchant name
- date (string): purchase date as YYYY-MM-DD
- total (number): final total amount paid, no currency symbol
- currency (string): ISO code like USD, PKR, EUR, or the symbol if unclear
- category (string): best guess such as Food, Travel, Office, Groceries, Other
If any field is unreadable, use null. Output raw JSON only — no markdown, no explanation.`;

export async function extractReceipt(base64Image: string, mimeType: string): Promise<ParsedReceipt> {
    const key = process.env.GEMINI_KEY;
    if (!key) throw new Error("GEMINI_KEY not set");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

    const body = {
        contents: [
            {
                parts: [
                    { inline_data: { mime_type: mimeType, data: base64Image } },
                    { text: PROMPT },
                ],
            },
        ],
        // Force pure-JSON output so we can JSON.parse it directly.
        generationConfig: { responseMimeType: "application/json" },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");

    return JSON.parse(text) as ParsedReceipt;
}
