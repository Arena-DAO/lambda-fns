import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { parse } from "cookie";
import { clearAuthData, getTokenData } from "src/auth-shared";

export const handler = async (
	event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
	try {
		// Get user ID from query params
		const queryParams = event.queryStringParameters || {};
		const userId = queryParams.user_id;

		if (!userId) {
			throw new Error("user_id is required");
		}

		// Get access token from cookie
		const cookies = event.headers.cookie ? parse(event.headers.cookie) : {};
		const accessToken = cookies.accessToken;

		if (accessToken) {
			// Get stored token data
			const tokenData = await getTokenData(userId);

			// If tokens match, clear the data
			if (tokenData && tokenData.accessToken === accessToken) {
				await clearAuthData(userId);
			}
		}
	} catch (error: any) {
		console.error("Error in auth-logout handler:", error);
		return {
			statusCode: 400,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
			body: JSON.stringify({
				error: "Bad Request",
				message: error.message || "An error occurred during logout",
			}),
		};
	}

	return {
		statusCode: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			"Set-Cookie":
				"accessToken=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
		},
		body: JSON.stringify({
			success: true,
			message: "Successfully logged out",
		}),
	};
};
