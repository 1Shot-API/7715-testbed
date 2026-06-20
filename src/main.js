import {
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  parseEther,
  parseUnits,
} from "viem";
import { bytesToHex } from "viem/utils";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";

const RELAYER_URL = "https://relayer.1shotapi.com/relayers";
const SUPPORTED_CHAIN_IDS = ["8453", "1"];
const WORK_TRANSFER_AMOUNT = "0.01";
const MOCK_FEE_AMOUNT = "0.01";

const connectButton = document.getElementById("connectButton");
const erc20Button = document.getElementById("erc20Button");
const nativeButton = document.getElementById("nativeButton");
const copyDecodedButton = document.getElementById("copyDecodedButton");
const copyRawButton = document.getElementById("copyRawButton");
const copyRelayerCurlButton = document.getElementById("copyRelayerCurlButton");
const accountLabel = document.getElementById("accountLabel");
const sessionLabel = document.getElementById("sessionLabel");
const statusText = document.getElementById("statusText");
const decodedJsonOutput = document.getElementById("decodedJsonOutput");
const rawContextOutput = document.getElementById("rawContextOutput");
const relayerCurlOutput = document.getElementById("relayerCurlOutput");

const chainIdSelect = document.getElementById("chainIdSelect");
const sessionAddressInput = document.getElementById("sessionAddressInput");
const tokenAddressInput = document.getElementById("tokenAddressInput");
const tokenDecimalsInput = document.getElementById("tokenDecimalsInput");
const transferDestinationInput = document.getElementById("transferDestinationInput");

let walletClient = null;
let connectedAddress = null;
let relayerCapabilities = null;
let lastDecodedDelegations = null;
let lastPermissionWasErc20 = false;
let relayerCurlRequestId = 0;

function setStatus(message) {
  statusText.textContent = message;
}

function setDecodedJsonOutput(value) {
  decodedJsonOutput.value = value;
}

function setRawContextOutput(value) {
  rawContextOutput.value = value;
}

function setRelayerCurlOutput(value) {
  relayerCurlOutput.value = value;
}

function jsonReplacer(_, item) {
  return typeof item === "bigint" ? item.toString() : item;
}

function safeJsonStringify(value) {
  return JSON.stringify(value, jsonReplacer, 2);
}

function toRelayerJson(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return `0x${value.toString(16)}`;
  }

  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }

  if (Array.isArray(value)) {
    return value.map(toRelayerJson);
  }

  if (typeof value === "object") {
    const out = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      out[key] = toRelayerJson(nestedValue);
    }
    return out;
  }

  return value;
}

function formatRelayerCurl(method, params) {
  const body = JSON.stringify(
    { jsonrpc: "2.0", id: 1, method, params },
    jsonReplacer
  );
  const escapedBody = body.replace(/'/g, `'\\''`);

  return `curl -X POST '${RELAYER_URL}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${escapedBody}'`;
}

function buildSendParams(decodedDelegations, feeAmount, workAmount, destinationAddress) {
  const chainId = chainIdSelect.value;
  const chainConfig = relayerCapabilities?.[chainId];
  const tokenAddress = tokenAddressInput.value.trim();

  const feeCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [chainConfig.feeCollector, feeAmount],
  });
  const workCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [destinationAddress, workAmount],
  });

  return {
    chainId,
    transactions: [
      {
        permissionContext: decodedDelegations.map(toRelayerJson),
        executions: [
          { target: tokenAddress, value: "0", data: feeCalldata },
          { target: tokenAddress, value: "0", data: workCalldata },
        ],
      },
    ],
  };
}

async function buildRelayerTransferCurl() {
  if (!lastPermissionWasErc20 || !lastDecodedDelegations?.length) {
    return "Request an ERC-20 permission first to generate the relayer curl command.";
  }

  const destinationAddress = transferDestinationInput.value.trim();
  if (!destinationAddress) {
    return "Enter a transfer destination address to generate the relayer curl command.";
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(destinationAddress)) {
    return "Enter a valid transfer destination address (0x + 40 hex chars).";
  }

  const chainId = chainIdSelect.value;
  const chainConfig = relayerCapabilities?.[chainId];
  if (!chainConfig) {
    return "Relayer capabilities are not loaded yet.";
  }

  const tokenDecimals = Number(tokenDecimalsInput.value);
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
    return "Token decimals must be a non-negative integer.";
  }

  let feeAmount = parseUnits(MOCK_FEE_AMOUNT, tokenDecimals);
  const workAmount = parseUnits(WORK_TRANSFER_AMOUNT, tokenDecimals);

  let sendParams = buildSendParams(
    lastDecodedDelegations,
    feeAmount,
    workAmount,
    destinationAddress
  );

  let estimate = await relayerRpc("relayer_estimate7710Transaction", sendParams);
  if (!estimate.success) {
    return `# relayer_estimate7710Transaction failed: ${estimate.error ?? "unknown error"}\n#\n# Fix the delegation scope or bundle, then regenerate.\n#\n${formatRelayerCurl("relayer_send7710Transaction", sendParams)}`;
  }

  const requiredFee = BigInt(estimate.requiredPaymentAmount);
  if (requiredFee !== feeAmount) {
    feeAmount = requiredFee;
    sendParams = buildSendParams(
      lastDecodedDelegations,
      feeAmount,
      workAmount,
      destinationAddress
    );
    estimate = await relayerRpc("relayer_estimate7710Transaction", sendParams);
    if (!estimate.success) {
      return `# relayer_estimate7710Transaction failed after fee adjustment: ${estimate.error ?? "unknown error"}`;
    }
  }

  return formatRelayerCurl("relayer_send7710Transaction", {
    ...sendParams,
    context: estimate.context,
  });
}

async function refreshRelayerCurlOutput() {
  const requestId = ++relayerCurlRequestId;
  setRelayerCurlOutput("Generating relayer curl command...");

  try {
    const curlCommand = await buildRelayerTransferCurl();
    if (requestId === relayerCurlRequestId) {
      setRelayerCurlOutput(curlCommand);
    }
  } catch (error) {
    if (requestId === relayerCurlRequestId) {
      setRelayerCurlOutput(`Failed to generate relayer curl command: ${error.message}`);
    }
  }
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

async function requestPermission(permission, { isErc20 = false } = {}) {
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
  lastDecodedDelegations = decodedDelegations;
  lastPermissionWasErc20 = isErc20;

  setDecodedJsonOutput(safeJsonStringify(decodedDelegations));
  setRawContextOutput(typeof context === "string" ? context : safeJsonStringify(context));
  setStatus("Permission granted. Decoded context JSON updated.");

  if (isErc20) {
    await refreshRelayerCurlOutput();
  } else {
    setRelayerCurlOutput(
      "Native permissions cannot be used for ERC-20 relayer transfers. Request an ERC-20 permission."
    );
  }
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

    const workAmount = parseUnits(WORK_TRANSFER_AMOUNT, tokenDecimals);
    const mockFeeAmount = parseUnits(MOCK_FEE_AMOUNT, tokenDecimals);

    await requestPermission(
      {
        type: "erc20-token-periodic",
        data: {
          tokenAddress,
          periodAmount: workAmount + mockFeeAmount,
          periodDuration: 86400,
          justification: "Allow relayer fee payment and ERC-20 transfer",
        },
        isAdjustmentAllowed: true,
      },
      { isErc20: true }
    );
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

copyRelayerCurlButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(relayerCurlOutput.value);
    setStatus("Relayer curl command copied to clipboard.");
  } catch {
    setStatus("Could not copy curl command automatically. Copy manually.");
  }
});

transferDestinationInput.addEventListener("input", () => {
  if (lastPermissionWasErc20 && lastDecodedDelegations?.length) {
    refreshRelayerCurlOutput();
  }
});

chainIdSelect.addEventListener("change", () => {
  try {
    applyChainConfig(chainIdSelect.value);
    setStatus(`Switched to chain ${chainIdSelect.value}. Config updated from relayer.`);
    if (lastPermissionWasErc20 && lastDecodedDelegations?.length) {
      refreshRelayerCurlOutput();
    }
  } catch (error) {
    setStatus(error.message);
  }
});

loadRelayerCapabilities().catch((error) => {
  setStatus(`Failed to load relayer config: ${error.message}`);
});
