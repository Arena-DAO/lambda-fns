import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";

// Set environment variables with defaults
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const BUCKET_NAME = process.env.BUCKET_NAME || "arena.dao.images";

export const handler = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Generate a unique key with a timestamp prefix
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const key = `uploads/${timestamp}-${randomString}`;

    // Check if BUCKET_NAME is set
    if (!BUCKET_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server configuration error: Missing bucket name" }),
      };
    }

    const s3Client = new S3Client({ region: AWS_REGION });

    // Create a presigned post URL with restrictions
    const post = await createPresignedPost(s3Client, {
      Bucket: BUCKET_NAME,
      Key: key,
      Conditions: [
        ["content-length-range", 0, 5242880], // Restrict file size to 5MB
        ["starts-with", "$Content-Type", "image/"] // Allow only images
      ],
      Fields: { "acl": "public-read" },
      Expires: 300 // 5 minutes expiration
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        postData: post, 
        imageUrl: `https://s3.${AWS_REGION}.amazonaws.com/${BUCKET_NAME}/${key}`
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
