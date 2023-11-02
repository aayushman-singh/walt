import React from 'react';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import { NextPage } from 'next';
import { useCallback } from 'react';

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
         <p>Drop files here</p>
   
       </div>
   
     )
   };
       

export default FileUpload;