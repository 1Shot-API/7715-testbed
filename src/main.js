import { createWalletClient, custom, parseEther, parseUnits } from "viem";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";

const RELAYER_URL = "https://relayer.1shotapi.com/relayers";
const SUPPORTED_CHAIN_IDS = ["8453", "1"];

const connectButton = document.getElementById("connectButton");
const erc20Button = document.getElementById("erc20Button");
const nativeButton = document.getElementById("nativeButton");
const copyDecodedButton = document.getElementById("copyDecodedButton");
const copyRawButton = document.getElementById("copyRawButton");
const accountLabel = document.getElementById("accountLabel");
const sessionLabel = document.getElementById("sessionLabel");
const statusText = document.getElementById("statusText");
const decodedJsonOutput = document.getElementById("decodedJsonOutput");
const rawContextOutput = document.getElementById("rawContextOutput");

const chainIdSelect = document.getElementById("chainIdSelect");
const sessionAddressInput = document.getElementById("sessionAddressInput");
const tokenAddressInput = document.getElementById("tokenAddressInput");
const tokenDecimalsInput = document.getElementById("tokenDecimalsInput");

let walletClient = null;
let connectedAddress = null;
let relayerCapabilities = null;

function setStatus(message) {
  statusText.textContent = message;
}

function setDecodedJsonOutput(value) {
  decodedJsonOutput.value = value;
}

function setRawContextOutput(value) {
  rawContextOutput.value = value;
}

function jsonReplacer(_, item) {
  return typeof item === "bigint" ? item.toString() : item;
}

function safeJsonStringify(value) {
  return JSON.stringify(value, jsonReplacer, 2);
}

function ensureMetaMask() {
  if (!window.ethereum) {
    throw new Error("MetaMask was not found. Please install MetaMask.");
  }
}

function ensureWalletConnected() {
  if (!walletClient || !connectedAddress) {
    throw new Error("Connect wallet first.");
  }
}

async function relayerRpc(method, params) {
  const response = await fetch(RELAYER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`Relayer request failed (${response.status}).`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "Relayer request failed.");
  }

  return payload.result;
}

async function loadRelayerCapabilities() {
  relayerCapabilities = await relayerRpc("relayer_getCapabilities", [
    ...SUPPORTED_CHAIN_IDS,
  ]);
  applyChainConfig(chainIdSelect.value);
}

function applyChainConfig(chainId) {
  const chainConfig = relayerCapabilities?.[chainId];
  if (!chainConfig) {
    throw new Error(`Relayer does not support chain ${chainId}.`);
  }

  sessionAddressInput.value = chainConfig.targetAddress;

  const usdc = chainConfig.tokens.find((token) => token.symbol === "USDC");
  if (!usdc) {
    throw new Error(`USDC is not available on chain ${chainId}.`);
  }

  tokenAddressInput.value = usdc.address;
  tokenDecimalsInput.value = usdc.decimals;

  if (connectedAddress) {
    sessionLabel.textContent = `Delegate Account: ${chainConfig.targetAddress}`;
  }
}

function getSessionAddress() {
  const targetAddress = sessionAddressInput.value.trim();
  if (!targetAddress) {
    throw new Error("Delegate account address is not loaded yet.");
  }

  return targetAddress;
}

function getPermissionEnvelope(permission) {
  const currentTime = Math.floor(Date.now() / 1000);
  const expiry = currentTime + 3600;
  const chainId = Number(chainIdSelect.value);
  const to = getSessionAddress();

  if (!Number.isInteger(chainId) || chainId < 1) {
    throw new Error("Chain ID must be a positive integer.");
  }

  return {
    chainId,
    expiry,
    to,
    permission,
  };
}

async function requestPermission(permission) {
  ensureWalletConnected();
  const envelope = getPermissionEnvelope(permission);

  setStatus("Requesting permission in MetaMask...");
  const grantedPermissions = await walletClient.requestExecutionPermissions([
    envelope,
  ]);

  if (!Array.isArray(grantedPermissions) || !grantedPermissions[0]?.context) {
    throw new Error("No permission context returned.");
  }

  const context = grantedPermissions[0].context;
  const decodedDelegations = decodeDelegations(context);
  setDecodedJsonOutput(safeJsonStringify(decodedDelegations));
  setRawContextOutput(typeof context === "string" ? context : safeJsonStringify(context));
  setStatus("Permission granted. Decoded context JSON updated.");
}

connectButton.addEventListener("click", async () => {
  try {
    ensureMetaMask();
    walletClient = createWalletClient({
      transport: custom(window.ethereum),
    }).extend(erc7715ProviderActions());

    const addresses = await walletClient.requestAddresses();
    connectedAddress = addresses?.[0] ?? null;

    if (!connectedAddress) {
      throw new Error("No account returned from wallet.");
    }

    const resolvedSessionAddress = getSessionAddress();
    accountLabel.textContent = `Wallet: ${connectedAddress}`;
    sessionLabel.textContent = `Delegate Account: ${resolvedSessionAddress}`;
    setStatus("Wallet connected. Ready to request permissions.");
  } catch (error) {
    setStatus(error.message);
  }
});

erc20Button.addEventListener("click", async () => {
  try {
    const tokenAddress = tokenAddressInput.value.trim();
    const tokenDecimals = Number(tokenDecimalsInput.value);

    if (!tokenAddress) {
      throw new Error("ERC-20 token address is required.");
    }

    if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
      throw new Error("Token decimals must be a non-negative integer.");
    }

    await requestPermission({
      type: "erc20-token-periodic",
      data: {
        tokenAddress,
        periodAmount: parseUnits("0.01", tokenDecimals),
        periodDuration: 86400,
        justification: "Allow spending a small ERC-20 amount each day",
      },
      isAdjustmentAllowed: true,
    });
  } catch (error) {
    setStatus(error.message);
  }
});

nativeButton.addEventListener("click", async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);

    await requestPermission({
      type: "native-token-periodic",
      data: {
        periodAmount: parseEther("0.0001"),
        periodDuration: 86400,
        startTime: currentTime,
        justification: "Allow spending a small native amount each day",
      },
      isAdjustmentAllowed: true,
    });
  } catch (error) {
    setStatus(error.message);
  }
});

copyDecodedButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(decodedJsonOutput.value);
    setStatus("Decoded context JSON copied to clipboard.");
  } catch {
    setStatus("Could not copy decoded JSON automatically. Copy manually.");
  }
});

copyRawButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(rawContextOutput.value);
    setStatus("Raw context copied to clipboard.");
  } catch {
    setStatus("Could not copy raw context automatically. Copy manually.");
  }
});

chainIdSelect.addEventListener("change", () => {
  try {
    applyChainConfig(chainIdSelect.value);
    setStatus(`Switched to chain ${chainIdSelect.value}. Config updated from relayer.`);
  } catch (error) {
    setStatus(error.message);
  }
});

loadRelayerCapabilities().catch((error) => {
  setStatus(`Failed to load relayer config: ${error.message}`);
});
