import type { AppProps } from "next/app";
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { AuthProvider } from "../contexts/AuthContext";
import Head from "next/head";
import "../styles/globals.css";

// Use Ethereum Mainnet as the active chain
const activeChain = "ethereum";

// Get client ID from environment variable
const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "test-api";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Vault Labs - Decentralized Storage</title>
        <link rel="shortcut icon" type="image/icon" href="assets/logo/favicon.png" />
        {/* Add other global head elements here */}
      </Head>
      <AuthProvider>
        <ThirdwebProvider
          activeChain={activeChain}
          clientId={clientId}
        >
          <Component {...pageProps} />
        </ThirdwebProvider>
      </AuthProvider>
    </>
  );
}

export default MyApp;
