import React, { useState, useCallback } from 'react';
import { useStorageUpload } from '@thirdweb-dev/react';
import { useDropzone } from 'react-dropzone';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useUserFileStorage } from '../hooks/useUserFileStorage';
import styles from './Home.module.css';

interface UploadedFile {
  name: string;
  ipfsUri: string;
  gatewayUrl: string;
  timestamp: number;
  type: string;
  size?: number;
}

const FileUpload: React.FC = () => {
  const [isUploading, setIsUploading] = useState(false);
  const { mutateAsync: upload } = useStorageUpload();
  const router = useRouter();
  const { user } = useAuth();
  const { addFiles } = useUserFileStorage(user?.uid || null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      
      setIsUploading(true);
      try {
        const uris = await upload({ data: acceptedFiles });
        console.log('Upload successful:', uris);

        // Create uploaded file objects
        const newFiles: UploadedFile[] = acceptedFiles.map((file, index) => ({
          name: file.name,
          ipfsUri: uris[index],
          gatewayUrl: uris[index].replace('ipfs://', 'https://ipfs.io/ipfs/'),
          timestamp: Date.now(),
          type: file.type || 'unknown',
          size: file.size
        }));

        // Add files to IPFS-based storage
        await addFiles(newFiles);

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error) {
        console.error('Upload failed:', error);
        alert('Upload failed. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [upload, router, addFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    multiple: true 
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <button className={styles["mainBtn"]} disabled={isUploading}>
        <p>
          {isUploading 
            ? 'Uploading...' 
            : isDragActive 
            ? 'Drop files here' 
            : 'Drop files here'}
        </p>
      </button>
    </div>
  );
};

export default FileUpload;