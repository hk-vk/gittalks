// Test script for Tigris storage
// Run with: npx tsx scripts/test-storage.ts

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev";
const bucketName = process.env.BUCKET_NAME || "gittalks";

console.log("🔧 Tigris Storage Test");
console.log("=".repeat(50));
console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket: ${bucketName}`);
console.log(`Access Key: ${accessKeyId?.slice(0, 10)}...`);
console.log("");

if (!accessKeyId || !secretAccessKey) {
  console.error("❌ Missing credentials! Check your .env.local file.");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: endpoint,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

async function testUpload() {
  const testFileName = `test-${Date.now()}.txt`;
  const testContent = `GitTalks storage test - ${new Date().toISOString()}`;

  try {
    // 1. Upload test file
    console.log("📤 Uploading test file...");
    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: `audio/${testFileName}`,
      Body: Buffer.from(testContent),
      ContentType: "text/plain",
    });
    
    await s3Client.send(uploadCommand);
    console.log(`✅ Upload successful!`);

    // 2. Get public URL
    const endpointHost = endpoint.replace("https://", "").replace("http://", "");
    const publicUrl = `https://${bucketName}.${endpointHost}/audio/${testFileName}`;
    console.log(`🔗 Public URL: ${publicUrl}`);

    // 3. Try to fetch the file
    console.log("📥 Verifying file access...");
    try {
      const response = await fetch(publicUrl);
      if (response.ok) {
        const content = await response.text();
        console.log(`✅ File accessible! Content: "${content}"`);
      } else {
        console.log(`⚠️ File uploaded but public access returned ${response.status}`);
        console.log("   Make sure your bucket is set to public in Tigris dashboard");
      }
    } catch (fetchError) {
      console.log(`⚠️ Could not fetch via public URL. Bucket might need public access settings.`);
    }

    // 4. Cleanup - delete test file
    console.log("🗑️ Cleaning up test file...");
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: `audio/${testFileName}`,
    });
    await s3Client.send(deleteCommand);
    console.log(`✅ Test file deleted`);

    console.log("");
    console.log("=".repeat(50));
    console.log("🎉 Storage test PASSED! Tigris is working correctly.");
    console.log("=".repeat(50));

  } catch (error: any) {
    console.error("");
    console.error("❌ Storage test FAILED!");
    console.error("Error:", error.message);
    
    if (error.Code === "AccessDenied") {
      console.error("\n💡 Tip: Check your Access Key permissions in Tigris dashboard");
    } else if (error.Code === "NoSuchBucket") {
      console.error(`\n💡 Tip: Bucket "${bucketName}" doesn't exist. Create it in Tigris dashboard.`);
    } else if (error.message?.includes("getaddrinfo")) {
      console.error("\n💡 Tip: Network error - check your internet connection");
    }
    
    process.exit(1);
  }
}

testUpload();
