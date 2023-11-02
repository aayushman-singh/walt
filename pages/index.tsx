import { ConnectWallet} from "@thirdweb-dev/react";
import styles from "styles/Home.module.css";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { use, useCallback } from "react";
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { useStorageUpload } from "@thirdweb-dev/react";
import Layout from "../components/Layout";
import { NextPage } from 'next';
import HomePageHtml from '../components/HomePageHtml';
import FileUpload from "../components/FileUpload";
import Home from "../pages/home"


function Provider() {
  return (
    <ThirdwebProvider
      clientId= "746eb2efea72743ef04e142981657f51" // You can get a client id from dashboard settings
      activeChain="goerli"
      >
      ...
    </ThirdwebProvider>
  );
}
const Index: NextPage = () => {
  return <Home/>;
};


export default Index;
