# Vault Labs - Decentralized Storage Platform

A modern Web3 application for secure, decentralized file storage using IPFS and Thirdweb.

## 🚀 Features

- **Decentralized Storage**: Upload files to IPFS for permanent, distributed storage
- **Upload History**: Track all your uploads with automatic localStorage persistence
- **File Previews**: View image previews directly in the interface
- **Multiple Gateway Options**: Access files via IPFS URIs or HTTP gateways
- **Copy to Clipboard**: Easily copy IPFS URIs and gateway links
- **Web3 Integration**: Built with Thirdweb SDK for seamless blockchain interaction
- **Modern UI**: Beautiful, responsive interface with smooth scrolling
- **Secure**: Client-side encryption and decentralized architecture

## 🛠️ Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Thirdweb** - Web3 development platform
- **IPFS** - Decentralized storage
- **React Dropzone** - File upload interface

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
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
   NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_client_id_here
   ```
   
   Get your Client ID from [Thirdweb Dashboard](https://thirdweb.com/dashboard/settings)

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
