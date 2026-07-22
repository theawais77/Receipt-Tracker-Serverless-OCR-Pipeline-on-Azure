import { app, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { extractReceipt } from "../shared/gemini";
import { getReceiptsContainer } from "../shared/cosmos";

// Extension -> MIME type, so Gemini knows how to read the image.
const MIME: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};

// Fires automatically whenever Function A drops a new blob in receipts-raw.
export async function ProcessReceipt(blob: Buffer, context: InvocationContext): Promise<void> {
    // Blob name looks like "demo-user/1699999-uuid.jpg"
    const blobName = context.triggerMetadata?.name as string;
    context.log(`Processing ${blobName} (${blob.length} bytes)`);

    const userId = blobName.split("/")[0] || "unknown";
    const ext = blobName.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = MIME[ext] || "image/jpeg";

    // Send image to Gemini Vision for OCR + field extraction.
    const base64 = blob.toString("base64");
    const parsed = await extractReceipt(base64, mimeType);

    // Build the record. userId is the Cosmos partition key.
    const record = {
        id: randomUUID(),
        userId,
        blobName,
        vendor: parsed.vendor,
        date: parsed.date,
        total: parsed.total,
        currency: parsed.currency,
        category: parsed.category,
        status: "processed",
        processedAt: new Date().toISOString(),
    };

    const container = getReceiptsContainer();
    await container.items.create(record);

    context.log(`Saved receipt ${record.id}: ${parsed.vendor} | ${parsed.total} ${parsed.currency}`);
}

app.storageBlob("ProcessReceipt", {
    path: "receipts-raw/{name}",
    connection: "AzureWebJobsStorage",
    handler: ProcessReceipt,
});
