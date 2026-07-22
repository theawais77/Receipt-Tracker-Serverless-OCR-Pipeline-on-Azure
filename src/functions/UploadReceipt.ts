import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { randomUUID } from "crypto";

// Raw images land here. A separate Blob-triggered function (Function B) will
// pick them up and run OCR. Keeping raw + processed separate = clean pipeline.
const RAW_CONTAINER = "receipts-raw";

// Map content-type -> file extension. Reject anything not an image.
const EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export async function UploadReceipt(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    const contentType = request.headers.get("content-type") || "";
    const ext = EXT[contentType];
    if (!ext) {
        return { status: 415, jsonBody: { error: `Unsupported type '${contentType}'. Send image/jpeg, image/png, or image/webp.` } };
    }

    // Read the raw image bytes from the request body.
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) {
        return { status: 400, jsonBody: { error: "Empty body. POST the image as raw binary." } };
    }

    // Connect to Blob storage (Azurite locally via UseDevelopmentStorage=true).
    const conn = process.env.AzureWebJobsStorage;
    if (!conn) {
        return { status: 500, jsonBody: { error: "AzureWebJobsStorage not set." } };
    }
    const blobService = BlobServiceClient.fromConnectionString(conn);
    const container = blobService.getContainerClient(RAW_CONTAINER);
    await container.createIfNotExists();

    // Unique blob name. userId will drive Cosmos partitioning later; hardcode for now.
    const userId = "demo-user";
    const blobName = `${userId}/${Date.now()}-${randomUUID()}.${ext}`;
    const blockBlob = container.getBlockBlobClient(blobName);

    await blockBlob.uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: contentType },
    });

    context.log(`Uploaded receipt to ${RAW_CONTAINER}/${blobName} (${bytes.length} bytes)`);

    return {
        status: 201,
        jsonBody: { message: "Receipt uploaded.", blob: blobName, size: bytes.length },
    };
}

app.http("UploadReceipt", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: UploadReceipt,
});
