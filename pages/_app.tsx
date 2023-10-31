import type { AppProps } from "next/app";
import { ChainId, ThirdwebProvider, getChainId } from "@thirdweb-dev/react";
import "../styles/globals.css";
import { ThirdwebStorage } from "@thirdweb-dev/storage";

// This is the chain your dApp will work on.
// Change this to the chain your app is built for.
// You can also import additional chains from `@thirdweb-dev/chains` and pass them directly.
const activeChain = ChainId.Mainnet;

//const storage = new ThirdwebStorage({
//  secretKey: "k8EeMQkEoqd74UnK3PfgLxjOm5mUqIui6smt620C4t8mqvpC5-vdVDRrXPVXa7JJYG3p5ZqA_lWGY9rND5SK6g", // You can get one from dashboard settings
//});

const ClientId = "746eb2efea72743ef04e142981657f51"

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThirdwebProvider
      activeChain={activeChain}
      clientId="746eb2efea72743ef04e142981657f51"
    >
      <Component {...pageProps} />
    </ThirdwebProvider>
  );
}

function Provider() {
  return (
    <ThirdwebProvider
      clientId= "746eb2efea72743ef04e142981657f51" // You can get a client id from dashboard settings
      activeChain={activeChain}
      >
      ...
    </ThirdwebProvider>
  );
}


export default MyApp;
