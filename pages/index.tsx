import { ConnectWallet} from "@thirdweb-dev/react";
import styles from "../styles/Home.module.css";
import Image from "next/image";
import { NextPage } from "next";
import { useDropzone } from "react-dropzone";
import { use, useCallback } from "react";
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { useStorageUpload } from "@thirdweb-dev/react";
import Hero from "../components/hero";





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


const Home: NextPage = () => {

 const { mutateAsync: upload } = useStorageUpload();


 
   
 const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const uris = await upload({data: acceptedFiles});
      console.log(uris);
    },
    [upload],
  );
  // And upload the data with the upload function
  const {getRootProps, getInputProps } = useDropzone({onDrop});

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <p>Drop files here</p>

    </div>

  )
};
    
export default Home;
