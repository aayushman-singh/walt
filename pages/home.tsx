import React from 'react';
import { NextPage } from 'next';
import HomePageHtml from '../components/HomePageHtml'; // Import the HomePageHtml component
import FileUpload from '../components/FileUpload'; // Import the FileUpload component

const Home: NextPage = () => {
  return (
    <div>
      {/* Include the HomePageHtml component for your website content */}
      <HomePageHtml />

      {/* Include the FileUpload component for file uploading */}
      <FileUpload />
    </div>
  );
};

export default Home;
