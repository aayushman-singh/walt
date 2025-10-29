# Vault Labs - Feature Implementation Roadmap

## **🔒 Phase 1 - IPFS Core (Pin it or Lose it)** [✅ COMPLETED]

### Critical Pinning Features
- [x] 1. **Pin Management System** - Manual pin/unpin files to ensure persistence ✅
- [x] 2. **Pin Status Indicator** - Visual indicator showing if files are pinned or unpinned ✅
- [x] 3. **Auto-pin Option** - Automatic pinning on upload with toggle ✅
- [ ] 4. **Pin Expiry/Renewal** - Set expiration dates for pins with renewal notifications (Future enhancement)
- [x] 5. **Pinning Services Integration** - Connect to Pinata, Web3.Storage, or other pinning services ✅
- [ ] 6. **Pin Cost Calculator** - Show storage costs and pin duration estimates (Basic implementation in lib)
- [ ] 7. **Pin History/Audit Log** - Track pinning/unpinning actions (Future enhancement)

### Storage Management (Phase 1)
- [x] 39. **Storage Quota Display** - Show used/available storage with visual indicator ✅
- [x] 40. **Storage Breakdown** - Show storage by file type (Pinned vs Unpinned) ✅
- [x] 41. **Large Files Warning** - Warn before uploading large files ✅

### What Was Implemented:
✅ Full Pinata API integration in `lib/pinningService.ts`
✅ Pin/Unpin functionality in `useUserFileStorage` hook
✅ Visual pin status badges (green for pinned, orange for unpinned)
✅ Pin/unpin buttons on each file
✅ Auto-pin toggle in sidebar
✅ Storage statistics showing pinned vs unpinned files
✅ Large file warning (>100MB) before upload
✅ Warning messages when unpinning files
✅ Documentation in README with setup instructions

---

## **📁 Phase 2 - Essential Google Drive Features** [✅ COMPLETED]

### File Organization
- [x] 8. **Folder/Directory Structure** - Create, nest, and organize files in folders ✅
- [x] 9. **Breadcrumb Navigation** - Navigate through folder hierarchy with URL navigation ✅
- [x] 10. **Move Files** - Move files between folders (drag & drop with visual feedback) ✅
- [x] 11. **File/Folder Rename** - Rename files and folders ✅
- [ ] 12. **Duplicate Files** - Copy/duplicate files - *Future enhancement*

### Sidebar Features (NOW FUNCTIONAL!)
- [x] 13. **Recent Files View** - Show recently accessed/modified files ✅
- [x] 14. **Starred/Favorites System** - Pin important files for quick access ✅
- [x] 15. **Trash/Recycle Bin** - Soft delete with restoration option ✅
- [ ] 16. **Shared with Me** - View files shared by others - *Future (Phase 3)*

### File Management
- [x] 23. **Download Files** - Direct download button (not just view) ✅
- [ ] 24. **File Preview/Viewer** - Preview PDFs, videos, audio, documents (not just images) - *Future enhancement*
- [ ] 25. **File Details Panel** - Right sidebar with metadata, activity, sharing info - *Future enhancement*

### Views & Display
- [x] 34. **Sorting Options** - Sort by name, date, size, type ✅
- [ ] 35. **Multiple Selection** - Select multiple files with checkboxes - *Cancelled for now*
- [ ] 36. **Bulk Operations** - Delete, move, share multiple files at once - *Cancelled for now*

### What Was Implemented:
✅ Complete folder hierarchy system with parent-child relationships
✅ Create folder functionality with prompt dialog
✅ Breadcrumb navigation showing current path with URL navigation
✅ **Browser back/forward button support for folder navigation**
✅ Rename files and folders via modal dialog
✅ **Drag & drop files to folders with visual feedback**
✅ **Drag & drop to breadcrumbs to move to parent folders**
✅ **Enhanced drag UI: transparent items, highlighted drop zones**
✅ **Customized drag preview (scaled & rotated)**
✅ Functional Recent view (last 30 days, sorted by access time)
✅ Functional Starred view with star/unstar toggle
✅ **Folders can now be starred (consistent with files)**
✅ **Consistent star button placement (overlay for images/folders)**
✅ Functional Trash with soft delete and restore
✅ Permanent delete from trash
✅ File download functionality
✅ Sorting by name, date, size, type with direction toggle
✅ **Optional sorting mode (prevents jarring real-time sorts)**
✅ **Starred items appear leftmost (improved organization)**
✅ Double-click to open files or navigate folders
✅ Visual indicators for starred items
✅ Context-aware action buttons (different for trash vs normal view)
✅ **3-dot menu for cleaner action interface**
✅ Folder icons and hover effects
✅ Auto-redirect to drive view when clicking folder from other views
✅ Last accessed tracking for recent files
✅ Modified date tracking

---

## **🔗 Phase 3 - Sharing & Collaboration** [✅ COMPLETED]

### Sharing & Permissions
- [x] 17. **Share Files/Folders** - Generate shareable links with permissions ✅
- [x] 18. **Permission Levels** - Viewer, Editor roles ✅
- [ ] 19. **Public/Private Toggle** - Control file visibility (Implemented via enable/disable)
- [ ] 20. **Share via Email** - Invite users directly - *Future enhancement*
- [x] 21. **Expiring Share Links** - Time-limited access links ✅
- [x] 22. **Password-Protected Shares** - Add password to shared links ✅

### Activity & Collaboration
- [x] 56. **Activity Logging** - Track all file actions (access, download, share, etc.) ✅
- [ ] 57. **Notifications** - Email/push notifications for shares, comments - *Future enhancement*
- [ ] 27. **File Comments/Notes** - Add comments/descriptions to files - *Future enhancement*

### What Was Implemented:
✅ ShareModal component with full configuration UI
✅ Share link generation with unique IDs
✅ Permission levels: Viewer (view only) and Editor (view + download)
✅ Expiring links with customizable duration (1-365 days)
✅ Password protection for shared links
✅ Public share page at `/share/[id]` with beautiful UI
✅ Password verification UI on share page
✅ Share access tracking (count + last accessed)
✅ Activity logging system (50 most recent actions per file)
✅ Share enable/disable functionality
✅ Copy link with visual feedback
✅ Mobile-responsive share page
✅ Context-aware empty states
✅ Share icon badges on shared files
✅ Integrated into dashboard with share button

---

## **🚀 Phase 4 - Advanced Features** [PLANNED]

### Version Control
- [ ] 26. **Version History** - Track file versions and revert to previous versions
- [x] 84. **Undo/Redo** - Undo deletions via trash restore ✅

### Real-time Collaboration
- [ ] 54. **Real-time Collaboration** - Edit documents together
- [ ] 55. **Activity Stream** - See who accessed/modified files
- [ ] 58. **User Comments** - Threaded comments on files

### Mobile & Accessibility
- [ ] 69. **Mobile App** - Native iOS/Android apps
- [ ] 70. **Offline Mode** - Access files offline with sync when online
- [ ] 71. **Document Scanner** - Scan documents via mobile camera
- [ ] 72. **Accessibility Features** - Screen reader support, keyboard navigation

---

## **📋 Additional Features (Backlog)**

### Search & Filtering
- [ ] 30. **Advanced Search Filters** - Filter by type, date, size, tags, pin status
- [ ] 31. **Search Suggestions** - Auto-complete and recent searches
- [ ] 32. **Filter by Owner** - In shared environments
- [ ] 33. **Saved Searches** - Save common search queries

### File Management (Additional)
- [ ] 28. **Tags/Labels System** - Categorize files with custom tags
- [ ] 29. **File Properties** - View/edit custom metadata
- [ ] 37. **File Preview on Hover** - Quick preview without opening
- [ ] 38. **Custom Columns** - Show/hide columns in list view
- [ ] 42. **Duplicate Detection** - Detect and warn about duplicate files
- [ ] 43. **Storage Cleanup Tools** - Find large/old files to delete

### Upload Features
- [ ] 44. **Upload Progress Bar** - Individual file progress (not just "Uploading...")
- [ ] 45. **Pause/Resume Uploads** - Control long uploads
- [ ] 46. **Upload Queue Management** - Manage multiple uploads
- [ ] 47. **Folder Upload** - Upload entire folders with structure
- [ ] 48. **URL Upload** - Add files from external URLs

### Sync & Backup
- [ ] 49. **Auto-sync** - Automatic sync instead of manual IPFS URI paste
- [ ] 50. **Desktop Sync Client** - Desktop app for file sync
- [ ] 51. **Conflict Resolution** - Handle sync conflicts
- [ ] 52. **Backup Schedule** - Automatic backups to IPFS
- [ ] 53. **Export All Files** - Download entire drive as ZIP

### Settings & Preferences
- [ ] 59. **User Settings Page** - Preferences, notifications, account settings
- [x] 60. **Theme Toggle** - Dark/light mode ✅
- [x] 61. **Default View Preference** - Remember grid/list preference ✅
- [x] 62. **Upload Settings** - Default pinning options (auto-pin toggle) ✅
- [ ] 63. **Keyboard Shortcuts** - Hotkeys for common actions

### Security & Privacy
- [ ] 64. **Two-Factor Authentication** - Additional security layer
- [ ] 65. **Activity Log** - View login history and file access logs
- [ ] 66. **File Encryption** - Client-side encryption option
- [ ] 67. **Access Revocation** - Revoke access to shared files
- [ ] 68. **Session Management** - View and manage active sessions

### Technical Improvements
- [ ] 73. **API Routes** - RESTful API for file operations (pages/api is empty)
- [ ] 74. **Firestore Integration** - Currently only stores file list URI, not individual file metadata
- [ ] 75. **Caching Strategy** - Cache frequently accessed files
- [ ] 76. **CDN Integration** - Faster file delivery
- [ ] 77. **Error Handling** - Better error messages and retry logic
- [ ] 78. **Loading States** - Skeleton loaders for better UX
- [ ] 79. **Analytics** - Track usage patterns

### UI/UX Enhancements
- [ ] 80. **Onboarding Tour** - Guide new users through features
- [x] 81. **Empty State Improvements** - Better empty state designs ✅
- [x] 82. **Contextual Menus** - 3-dot dropdown menus for actions ✅
- [x] 83. **Tooltips** - Helpful tooltips throughout interface ✅

---

## **Notes**

### IPFS Pinning Information
- IPFS "pin it or lose it" is **NOT deprecated** and remains core to IPFS data persistence
- Unpinned files may be garbage collected from IPFS nodes
- Pinning services (Pinata, Web3.Storage, Filebase) provide reliable long-term storage
- Consider implementing a warning system when files are unpinned

### Current Implementation Status
- ✅ Basic file upload to IPFS
- ✅ User authentication (Firebase)
- ✅ File list storage on IPFS
- ✅ Basic search functionality
- ✅ Grid/List view toggle
- ❌ NO pinning management (files may disappear!)
- ❌ NO folder structure
- ❌ NO sharing capabilities
- ❌ NO version history

### Priority Justification
**Phase 1** is critical because without proper pinning:
- Files uploaded by users may disappear after garbage collection
- No guarantee of data persistence
- Poor user experience and data loss risk

This violates the core promise of reliable storage!

