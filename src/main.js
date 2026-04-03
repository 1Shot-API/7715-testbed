import { createWalletClient, custom, parseEther, parseUnits } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";

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

const chainIdInput = document.getElementById("chainIdInput");
const sessionAddressInput = document.getElementById("sessionAddressInput");
const tokenAddressInput = document.getElementById("tokenAddressInput");
const tokenDecimalsInput = document.getElementById("tokenDecimalsInput");

let walletClient = null;
let connectedAddress = null;
let sessionAddress = null;

function setStatus(message) {
  statusText.textContent = message;
}

function setDecodedJsonOutput(value) {
  decodedJsonOutput.value = value;
}

function setRawContextOutput(value) {
  rawContextOutput.value = value;
}

function safeJsonStringify(value) {
  return JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );
}

function ensureMetaMask() {
  if (!window.ethereum) {
    throw new Error("MetaMask was not found. Please install MetaMask Flask.");
  }
}

function ensureWalletConnected() {
  if (!walletClient || !connectedAddress) {
    throw new Error("Connect wallet first.");
  }
}

function getSessionAddress() {
  const userEnteredAddress = sessionAddressInput.value.trim();
  if (userEnteredAddress) {
    return userEnteredAddress;
  }

  if (!sessionAddress) {
    const account = privateKeyToAccount(generatePrivateKey());
    sessionAddress = account.address;
  }

  return sessionAddress;
}

function getPermissionEnvelope(permission) {
  const currentTime = Math.floor(Date.now() / 1000);
  const expiry = currentTime + 3600;
  const chainId = Number(chainIdInput.value);
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
