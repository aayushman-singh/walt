import type { AppProps } from "next/app";
import { ThirdwebProvider } from "@thirdweb-dev/react";
import Head from "next/head";
import "../styles/globals.css";

// Use Ethereum Mainnet as the active chain
const activeChain = "ethereum";

// Get client ID from environment variable
const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "746eb2efea72743ef04e142981657f51";

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
      <ThirdwebProvider
        activeChain={activeChain}
        clientId={clientId}
      >
        <Component {...pageProps} />
      </ThirdwebProvider>
    </>
  );
}

export default MyApp;
