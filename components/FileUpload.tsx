import React from 'react';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import { NextPage } from 'next';
import { useCallback } from 'react';
import styles from './Home.module.css';

const FileUpload: NextPage = () => {

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
         <button className={styles["mainBtn"]}><p>Drop files here</p></button>
   
       </div>
   
     )
   };
       

export default FileUpload;