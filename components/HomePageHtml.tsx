import React from 'react';
import styles from './Home.module.css';
import FileUpload from './FileUpload';

const HomePageHtml: React.FC = () => {
  return (
    <div>
      <header>
        <div className={styles['menu-bar']}>
          <div className={styles.logo}>
            <img src="/images/VaultLabsLogoWhtBg.png" alt="Vault Labs" style={{ width: '150px', height: 'auto' }} />
          </div>
          <div className={styles['menu-items']}>
            <div className={styles['menu-item']}>Home</div>
            <div className={styles['menu-item']}>About</div>
            <div className={styles['menu-item']}>How it works</div>
            <div className={styles['menu-item']}>Vault</div>
          </div>
        </div>
      </header>

      <main>
        <section id="welcome-hero" className="welcome-hero">
          <div className="container">
            <div className="row">
              <div className="col-md-12 text-center">
                <div className="header-text">
                  <h2>Easy and Reliable Asset </h2>
                  <h2>Storage with E-Vault</h2>
                  <p>ui/ux designer and web developer</p>
                
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className={styles['main-function']}>
          <FileUpload />
        </div>
        <p>content of homepage</p>
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
