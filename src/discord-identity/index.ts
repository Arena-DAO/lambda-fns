import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getDiscordProfileFromToken, getValidAccessToken } from "src/auth-shared";

const FAUCET_MNEMONIC = process.env.FAUCET_MNEMONIC;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://neutron-rpc.publicnode.com:443";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const GAS_PRICE = process.env.GAS_PRICE || "0.0053untrn";
const BECH32_PREFIX = process.env.BECH32_PREFIX || "neutron";

/**
 * Lambda handler for interacting with the Arena Discord Identity smart contract.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Validate environment variables
    if (!FAUCET_MNEMONIC || !CONTRACT_ADDRESS) {
      throw new Error("Missing required environment variables: FAUCET_MNEMONIC or CONTRACT_ADDRESS.");
    }

    // Validate Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Authorization header with Bearer token is required.");
    }
    const token = await getValidAccessToken(authHeader.split(" ")[1]);

    // Query Discord API for Discord ID
    const profile = await getDiscordProfileFromToken(token);

    // Parse and validate request body
    if (!event.body) {
      throw new Error("Request body is required.");
    }

    let body: { walletAddress: string };
    try {
      body = JSON.parse(event.body);
    } catch (err) {
      throw new Error("Invalid JSON in request body.");
    }

    const { walletAddress } = body;
    if (!walletAddress) {
      throw new Error("walletAddress is required.");
    }

    // Step 1: Connect to the blockchain
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(FAUCET_MNEMONIC, {
      prefix: BECH32_PREFIX,
    });
    const client = await SigningCosmWasmClient.connectWithSigner(RPC_ENDPOINT, wallet, {
      gasPrice: GasPrice.fromString(GAS_PRICE),
    });

    const account = (await wallet.getAccounts())[0];

    // Step 2: Execute the smart contract method
    const msg = {
      set_profile: {
        user_id: profile.id,
        avatar_hash: profile.avatar,
        username: profile.username,
        addr: walletAddress,
      },
    };
    const result = await client.execute(account.address, CONTRACT_ADDRESS, msg, "auto");

    // Return success response
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, txHash: result.transactionHash, message: "Operation completed successfully." }),
    };
  } catch (error: any) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Internal server error." }),
    };
  }
};