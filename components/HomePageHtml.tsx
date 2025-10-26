import React, { useState } from 'react';
import styles from './Home.module.css';
import FileUpload from './FileUpload';
import AuthModal from './AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { scrollToSection } from './SmoothScroll';
import Link from 'next/link';

const HomePageHtml: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user } = useAuth();

  return (
    <div className={styles["bg"]}>
      <header>
        <div className={styles['menu-bar']}>
          <div className={styles.logo}>
            <img src="/images/VaultLabsLogoWhtBg.png" 
            alt="Vault Labs" style={{ width: '200px', height: 'auto' }} />
          </div>
          <div className={styles['menu-items']}>
          <a href="#welcome-hero" onClick={(scrollToSection)} className={styles['menu-item']}>Home</a>
          <a href="#about" onClick={(scrollToSection)} className={styles['menu-item']}>About</a>
          <a href="#working" onClick={(scrollToSection)} className={styles['menu-item']}>How it works</a>
          {user ? (
            <Link href="/dashboard" className={styles['menu-item']}>Dashboard</Link>
          ) : (
            <button 
              className={styles['menu-item'] + ' ' + styles['authBtn']}
              onClick={() => setShowAuthModal(true)}
            >
              Sign In
            </button>
          )}
          </div>
        </div>
      </header>

      <main className={styles['main']}>
        <section id="welcome-hero" className={styles["welcome-hero"]}>
          <div className={styles["container"]}>
            <div className="row">
              <div className="col-md-12 text-center">
                <div className={styles["header-text"]}>
                  <h2>Easy and Reliable Asset<br></br>
                  Storage with E-Vault</h2>
                  <p style={{color: '#844cfc'}}>Experience true data security</p>
                    <div className={styles['main-link']}>
                      {user ? (
                        <FileUpload/>
                      ) : (
                        <button 
                          className={styles["mainBtn"]}
                          onClick={() => setShowAuthModal(true)}
                        >
                          <p>Sign In to Upload Files</p>
                        </button>
                      )}
                    </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles["spacer-layer"]}>
          <img className={styles["spacer"]} src='./images/layerv2.png'/>
        </div>
          
        <section id="about" className={styles["vault"]}>
          
          <div className={styles["flex-container"]}>
          <div className={styles["flex-item"]}>
            <img src="/images/logo1.png" alt="Image 1" className={styles["flexbox-image"]} />
            <h2>Our Story</h2>
            <p>We're a dedicated team of aspiring engineers that are determined 
                to offer the best customer experience when it comes to keeping your 
                belongings safe!</p>
            
          </div>
            
          <div className={styles["flex-item"]}>
          <img src="/images/logo2.png" alt="Image 2" className={styles["flexbox-image"]} />
            <h2>Our Vision</h2>
            <p>Creating an ideal future where users can store and keep their data with us,
               safe and completely anonymous</p>
           </div>

          <div className={styles["flex-item"]}>
          <img src="/images/logo3.png" alt="Image 3" className={styles["flexbox-image"]} />
            <h2>Technology</h2>
            <p>Blockchains aren't just good for crypto rugpulls, we're delivering the power 
              of the complex Web 3.0 to our users with an intuitive approach to keep things 
              simple while maintaining top notch security measures. A privately hosted L-2 
              blockchain capable of safeguarding anything you wish in your hands</p>
          </div>
          </div>
           

        </section>

        <section id="working" className={styles["working"]}>
          
          <div className={styles["working-container"]}>
            <h2>How it works</h2>
          </div>
            
          <div className={styles["working-container"]}>
          <div className={styles["box"]}>
            <img src="/images/image1.png" alt="img1" className={styles["box-img"]}/>
          </div>
          <div className={styles["box"]}>
            <h3>Secured</h3>
            <p>Untouchable by anyone other than you, our staff included Anonymous.  
              Upload your documents with ease on a native private blockchain 
              network and access them whenever you want from our interactive 
              interface.</p>
          </div>
          <div className={styles["box"]}>
            <h3>Accessible</h3>
            <p>Zero Delay access at any time and any place. Completely private file 
              storage made easy by our simple interface and 24/7 customer service
              team</p>
          </div>
          <div className={styles["box"]}>
            <img src="/images/image2.png" alt="img2" className={styles["box-img"]}/>
          </div>
          </div>
           

        </section>
        
      </main>
      <footer className={styles["footer"]}>

        <div className={styles["footer-text"]}>
        <p>&copy; 2024 Vault Labs. All rights reserved.</p>
        </div>
        <div className={styles["footer-container"]}>
          <a href="#" className={styles["footer-link"]}>
          <img src="/images/link1.png" alt="Social Link" className={styles["footer-img"]}/>
          </a>
          {/* Add more social media links by adding images to public/images/ */}
        </div>
        
        
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  );
};

export default HomePageHtml;
