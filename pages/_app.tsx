import type { AppProps } from "next/app";
import { ChainId, ThirdwebProvider } from "@thirdweb-dev/react";
import Head from "next/head";
import "../styles/globals.css";

// This is the chain your dApp will work on.
const activeChain = ChainId.Mainnet;

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Vault Labs</title>
        <link rel="shortcut icon" type="image/icon" href="assets/logo/favicon.png" />
        {/* Add other global head elements here */}
      </Head>
      <ThirdwebProvider
        activeChain={activeChain}
        clientId="746eb2efea72743ef04e142981657f51"
      >
        <Component {...pageProps} />
      </ThirdwebProvider>
    </>
  );
}

export default MyApp;
