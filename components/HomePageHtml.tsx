import React from 'react';

const HomePageHtml: React.FC = () => {
  return (
    <div>
      <header>
        <h1>Welcome to My Website</h1>
      </header>
      <main>
        <p>This is the content of my homepage.</p>
        <img src="/path/to/image.jpg" alt="Sample Image" />
        <a href="/another-page">Go to another page</a>
      </main>
      <footer>
        <p>&copy; 2023 My Website</p>
      </footer>
    </div>
  );
};

export default HomePageHtml;
