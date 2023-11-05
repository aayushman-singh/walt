import React, { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode; // Define the children prop
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div>
      {/* Include a header, navigation, or any other common elements here */}
      <header>
        {/* Header content */}
      </header>
      <main>
        
        {children} {/* This is where your specific page content goes */}
      </main>
      {/* Include a footer, copyright, or any other common elements here */}
      <footer>
        {/* Footer content */}
      </footer>
    </div>
  );
}

export default Layout;
