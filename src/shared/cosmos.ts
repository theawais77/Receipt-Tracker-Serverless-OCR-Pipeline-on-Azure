// Single reusable Cosmos DB container client.
// Cached across invocations so we don't reconnect on every function run.

import { CosmosClient, Container } from "@azure/cosmos";

let container: Container | undefined;

export function getReceiptsContainer(): Container {
    if (container) return container;

    const conn = process.env.COSMOS_CONNECTION;
    if (!conn) throw new Error("COSMOS_CONNECTION not set");

    const client = new CosmosClient(conn);
    container = client.database("ReceiptsDB").container("receipts");
    return container;
}
