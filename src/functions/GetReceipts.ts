import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getReceiptsContainer } from "../shared/cosmos";

// GET /api/receipts?userId=demo-user
// Returns the user's receipts plus totals grouped by month.
export async function GetReceipts(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const userId = request.query.get("userId") || "demo-user";
    const container = getReceiptsContainer();

    // Parameterized query — never string-concat user input into SQL.
    // partitionKey scopes the read to one partition = cheaper + faster.
    const { resources } = await container.items
        .query(
            {
                query:
                    "SELECT c.id, c.vendor, c.date, c.total, c.currency, c.category, c.blobName, c.processedAt FROM c WHERE c.userId = @userId",
                parameters: [{ name: "@userId", value: userId }],
            },
            { partitionKey: userId }
        )
        .fetchAll();

    // Sort newest-first in code (avoids Cosmos ORDER BY dropping null-date docs).
    resources.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Sum totals per YYYY-MM.
    const monthlyTotals: Record<string, number> = {};
    for (const r of resources) {
        if (r.date && typeof r.total === "number") {
            const month = r.date.slice(0, 7); // "2026-07"
            monthlyTotals[month] = Math.round(((monthlyTotals[month] || 0) + r.total) * 100) / 100;
        }
    }

    return {
        jsonBody: {
            userId,
            count: resources.length,
            monthlyTotals,
            receipts: resources,
        },
    };
}

app.http("GetReceipts", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "receipts",
    handler: GetReceipts,
});
