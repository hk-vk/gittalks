import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
    // Enable cache interception for faster ISR/SSG page loads
    // Set to false if using Partial Prerendering (PPR)
    enableCacheInterception: true,

    // Route preloading behavior
    // Options: "none" | "withWaitUntil" | "preload"
    routePreloadingBehavior: "none",

    // Optional: Configure incremental cache strategy
    // Uncomment if you want to use KV or R2 for caching
    // incrementalCache: kvIncrementalCache, // or r2IncrementalCache

    // Optional: Configure tag cache for revalidation
    // tagCache: d1NextTagCache,

    // Optional: Configure queue for ISR
    // queue: memoryQueue,
});
