const { SigningStargateClient, GasPrice } = require("@cosmjs/stargate");
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing")

const FAUCET_MNEMONIC = process.env.FAUCET_MNEMONIC;
const RPC_ENDPOINT = "https://neutron-rpc.publicnode.com:443";
const DENOM = "untrn";
const AMOUNT_TO_SEND = "100000";
const GAS_PRICE = "0.0053untrn"

const handler = async (event) => {
  try {
    const { walletAddress } = JSON.parse(event.body);

    if (!walletAddress) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Wallet address is required" }),
      };
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(FAUCET_MNEMONIC, {
      prefix: "neutron",
    });
    const client = await SigningStargateClient.connectWithSigner(RPC_ENDPOINT, wallet, { gasPrice: GasPrice.fromString(GAS_PRICE) });
    const faucetAccount = (await wallet.getAccounts())[0];

    const amount = {
      denom: DENOM,
      amount: AMOUNT_TO_SEND,
    };

    const result = await client.sendTokens(
      faucetAccount.address,
      walletAddress,
      [amount],
      "auto",
      "Arena DAO gas distribution"
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, txHash: result.transactionHash }),
    };
  } catch (error) {
    console.error("Error processing faucet request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process request" }),
    };
  }
};

module.exports = { handler };