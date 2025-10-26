# Vault Labs - Decentralized Storage Platform

A modern Web3 application for secure, decentralized file storage using IPFS and Thirdweb.

## 🚀 Features

- **🔐 User Authentication**: Secure login with Firebase Auth (Google & Email/Password)
- **📁 Google Drive Style Dashboard**: Professional file management interface
- **🌐 Decentralized Storage**: Upload files to IPFS for permanent, distributed storage
- **👤 User-Specific Storage**: Each user has their own private file collection
- **🖼️ File Previews**: View image previews directly in the interface
- **🔗 Multiple Gateway Options**: Access files via IPFS URIs or HTTP gateways
- **📋 Copy to Clipboard**: Easily copy IPFS URIs and gateway links
- **🔍 Search Functionality**: Find files quickly with built-in search
- **📱 Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **⚡ Web3 Integration**: Built with Thirdweb SDK for seamless blockchain interaction

## 🛠️ Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Firebase Auth** - User authentication
- **Thirdweb** - Web3 development platform
- **IPFS** - Decentralized storage
- **React Dropzone** - File upload interface

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase Project ([Create one here](https://console.firebase.google.com/))
- Thirdweb Client ID ([Get one here](https://thirdweb.com/dashboard/settings))

## 🔧 Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd walt
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Firebase Configuration
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   
   # Thirdweb Configuration
   NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_client_id_here
   ```
   
   **Firebase Setup:**
   1. Go to [Firebase Console](https://console.firebase.google.com/)
   2. Create a new project
   3. Enable Authentication → Sign-in method → Google & Email/Password
   4. Go to Project Settings → General → Your apps → Web app
   5. Copy the config values to your `.env.local`
   
   **Thirdweb Setup:**
   - Get your Client ID from [Thirdweb Dashboard](https://thirdweb.com/dashboard/settings)

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗️ Build for Production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
walt/
├── components/       # React components
├── pages/           # Next.js pages and API routes
├── public/          # Static assets
├── styles/          # CSS modules
└── package.json     # Dependencies
```

## 🔐 Security Note

⚠️ **Important**: Never commit your `.env.local` file to version control. It contains sensitive API keys.

## 📝 License

See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
