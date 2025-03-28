import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";

export const handler = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Generate a unique key with a timestamp prefix
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const key = `uploads/${timestamp}-${randomString}`;
    
    // Check if BUCKET_NAME environment variable exists
    if (!process.env.BUCKET_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server configuration error: Missing bucket name" }),
      };
    }
    
    const s3Client = new S3Client({ region: "us-east-2" });
    
    // Create a presigned post URL with restrictions
    const post = await createPresignedPost(s3Client, {
      Bucket: process.env.BUCKET_NAME,
      Key: key,
      Conditions: [
        // Restrict file size to 5MB max
        ["content-length-range", 0, 5242880],
        // Only allow image content types
        ["starts-with", "$Content-Type", "image/"]
      ],
      Expires: 300 // 5 minutes expiration
    });
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        postData: post, 
        imageUrl: `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${key}` 
      }),
    };
  } catch (error) {
    console.error("Error generating presigned post:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Something went wrong" }) 
    };
  }
};