# Vault Labs - Decentralized Storage Platform

A modern Web3 application for secure, decentralized file storage using IPFS and Thirdweb.

## 🚀 Features

### Core Features
- **🔐 User Authentication**: Secure login with Firebase Auth (Google & Email/Password)
- **📁 Google Drive Style Dashboard**: Professional file management interface
- **🌐 Decentralized Storage**: Upload files to IPFS for permanent, distributed storage
- **⚡ Web3 Integration**: Built with Thirdweb SDK for seamless blockchain interaction
- **📱 Responsive Design**: Works perfectly on desktop, tablet, and mobile

### IPFS Pinning (Phase 1 - ✅ Complete)
- **📌 IPFS Pinning Management**: Pin/unpin files to ensure data persistence ("Pin it or Lose it")
- **📊 Storage Analytics**: Track pinned vs unpinned files with detailed statistics
- **⚙️ Auto-Pin Toggle**: Automatically pin new uploads or manage manually
- **⚠️ Large File Warnings**: Get alerts before uploading files over 100MB

### File Organization (Phase 2 - ✅ Complete)
- **📁 Folder Hierarchy**: Create and organize files in nested folders
- **🗂️ Breadcrumb Navigation**: Navigate through folders with clickable breadcrumbs
- **✏️ Rename Files/Folders**: Rename any file or folder easily
- **🔄 Sorting Options**: Sort by name, date, size, or type (ascending/descending)
- **⭐ Starred Items**: Star important files and folders for quick access
- **⏰ Recent Files**: View recently accessed files (last 30 days)
- **🗑️ Trash/Recycle Bin**: Soft delete with restore option, permanent delete from trash
- **⬇️ File Download**: Download files directly to your device
- **👁️ File Preview**: View image previews directly in the interface
- **🔍 Search Functionality**: Find files quickly with built-in search
- **🔗 Multiple Gateway Options**: Access files via IPFS URIs or HTTP gateways
- **📋 Copy to Clipboard**: Easily copy IPFS URIs and gateway links
- **👤 User-Specific Storage**: Each user has their own private file collection

### Sharing & Collaboration (Phase 3 - ✅ Complete)
- **🔗 Share Links**: Generate shareable links for any file or folder
- **👁️ Permission Levels**: Viewer (view only) or Editor (view + download)
- **⏰ Expiring Links**: Set expiration dates for shared links (1-365 days)
- **🔒 Password Protection**: Add password protection to shared links
- **📊 Access Tracking**: Track how many times a shared link was accessed
- **🚫 Revoke Sharing**: Disable share links at any time
- **📝 Activity Logs**: Track all file actions (access, download, share, etc.)
- **🌐 Public Share Page**: Beautiful landing page for shared content
- **📱 Mobile-Friendly Sharing**: Share pages work perfectly on any device

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
   
   # IPFS Pinning Service (Optional but Recommended)
   # Options: 'local' (default), 'pinata', 'web3storage', 'filebase'
   NEXT_PUBLIC_PINNING_SERVICE=pinata
   
   # Pinata Configuration (if using Pinata)
   NEXT_PUBLIC_PINATA_API_KEY=your_pinata_api_key
   NEXT_PUBLIC_PINATA_API_SECRET=your_pinata_api_secret
   ```
   
   **Firebase Setup:**
   1. Go to [Firebase Console](https://console.firebase.google.com/)
   2. Create a new project
   3. Enable Authentication → Sign-in method → Google & Email/Password
   4. Go to Project Settings → General → Your apps → Web app
   5. Copy the config values to your `.env.local`
   
   **Thirdweb Setup:**
   - Get your Client ID from [Thirdweb Dashboard](https://thirdweb.com/dashboard/settings)
   
   **Pinata Setup (Optional but Recommended):**
   1. Create a free account at [Pinata](https://app.pinata.cloud/)
   2. Go to API Keys → Generate New Key
   3. Enable "pinFileToIPFS", "pinByHash", "unpin", and "pinList" permissions
   4. Copy the API Key and API Secret to your `.env.local`
   5. Set `NEXT_PUBLIC_PINNING_SERVICE=pinata`
   
   **Why Use Pinning?**
   - Without pinning, files uploaded to IPFS may be garbage collected and lost
   - Pinning services ensure your files remain available permanently
   - The default "local" mode uses Thirdweb but doesn't guarantee long-term persistence

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
├── contexts/         # React contexts (Auth, etc.)
├── hooks/           # Custom React hooks (useUserFileStorage)
├── lib/             # Utility libraries (Firebase, Pinning Service)
├── pages/           # Next.js pages and API routes
├── public/          # Static assets
├── styles/          # CSS modules
├── todo.md          # Feature roadmap
└── package.json     # Dependencies
```

## 📌 IPFS Pinning Features

### What is "Pin it or Lose it"?

IPFS uses a garbage collection mechanism to remove unpinned content. When you upload a file to IPFS without pinning it to a dedicated service, there's no guarantee it will remain accessible long-term.

### Pinning Features in Vault Labs

- **📌 Manual Pin/Unpin**: Control which files are permanently stored
- **⚙️ Auto-Pin Toggle**: Automatically pin all uploads (recommended)
- **📊 Storage Statistics**: View pinned vs unpinned file counts and sizes
- **⚠️ Unpin Warnings**: Get alerts before unpinning files
- **🔍 Visual Indicators**: See pin status at a glance with badges
- **💰 Cost Awareness**: Large file warnings to manage storage costs

### Supported Pinning Services

- **Local** (Default): Uses Thirdweb storage without dedicated pinning
- **Pinata**: Popular IPFS pinning service with free tier
- **Web3.Storage**: (Coming soon)
- **Filebase**: (Coming soon)

## 🔐 Security Note

⚠️ **Important**: Never commit your `.env.local` file to version control. It contains sensitive API keys.

## 📝 License

See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
