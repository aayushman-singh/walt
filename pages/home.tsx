import React from 'react';
import { NextPage } from 'next';
import HomePageHtml from '../components/HomePageHtml'; 
import Layout from '../components/Layout';

const Home: NextPage = () => {
  return (
    <Layout>
    <main>
      {/* Include the HomePageHtml component for your website content */}
      <HomePageHtml />
    </main>
    </Layout>
  );
};
    
export default Home;
