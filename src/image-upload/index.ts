import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Check if event.body exists before parsing
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing request body" }),
      };
    }
    
    const { fileType } = JSON.parse(event.body);
    
    // Check that the file type is an image
    if (!fileType.startsWith('image/')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Only image files are allowed!" }),
      };
    }
    
    const fileExtension = fileType.split('/')[1];
    const key = `uploads/${Date.now()}-${Math.random()}.${fileExtension}`;
    
    const postParams = {
      Bucket: process.env.BUCKET_NAME,
      Fields: {
        key: key,
        'Content-Type': fileType,
      },
      Conditions: [
        // Restrict file size to 5MB max
        ["content-length-range", 0, 5242880],
        // Ensure the Content-Type matches what we expect
        ["eq", "$Content-Type", fileType]
      ],
      Expires: 60
    };
    
    const s3Client = new S3Client({ region : "us-east-2" });
    const post = await createPresignedPost(s3Client, postParams);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
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