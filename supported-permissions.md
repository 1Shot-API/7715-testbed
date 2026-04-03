# Get supported permissions

[ERC-7715](https://eip.tools/eip/7715) defines an RPC method that returns the execution permissions
a wallet supports. Use the method to verify the available Advanced Permissions types and
rules before sending requests.


## Prerequisites​

- [Install and set up the Smart Accounts Kit](https://docs.metamask.io/smart-accounts-kit/development/get-started/install/)
- [Learn about Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/development/concepts/advanced-permissions/)


## Request supported permissions​

Request the supported Advanced Permissions types for a wallet with the
Wallet Client's [getSupportedExecutionPermissions](https://docs.metamask.io/smart-accounts-kit/development/reference/advanced-permissions/wallet-client/#getsupportedexecutionpermissions) action.

```
import { walletClient } from "./config.ts";

const supportedPermissions = await walletClient.getSupportedExecutionPermissions();

```

See the full list of [supported Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/development/get-started/supported-advanced-permissions/).