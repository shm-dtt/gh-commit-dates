# GitHub Repo Dates Extension

A browser extension that enhances GitHub repository pages by displaying key repository dates directly in the UI.

## Features

* **Repository Created Date** : Shows when the repository was first created
* **First Commit Date** : Displays the date of the very first commit in the repository
* **Latest Commit Date** : Shows when the most recent commit was made
* **Time Ago Format** : Displays dates in a human-readable "time ago" format with tooltips showing exact dates
* **Dark Mode Support** : Automatically adapts to GitHub's dark theme
* **Responsive Design** : Works on both desktop and mobile views
* **PJAX Navigation** : Updates automatically when navigating between GitHub pages

## Installation

### Chrome/Edge (Chromium-based browsers)

1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will be active on all GitHub repository pages

### Firefox

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from the extension folder

## How It Works

The extension:

1. **Detects Repository Pages** : Automatically identifies when you're viewing a GitHub repository
2. **Fetches Repository Data** : Uses GitHub's public API to retrieve repository information
3. **Gets Commit History** : Retrieves the first and latest commits from the repository
4. **Displays Information** : Adds a clean, integrated UI element showing all three dates
5. **Updates Dynamically** : Refreshes when you navigate to different repositories

## File Structure

```
github-repo-dates/
├── manifest.json          # Extension manifest (Chrome/Firefox compatible)
├── content.js             # Main extension logic
├── styles.css             # Styling for the date display
├── icons/                 # Extension icons (16x16, 32x32, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon32.png  
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## API Usage

The extension uses GitHub's public REST API:

* `GET /repos/{owner}/{repo}` - Repository information
* `GET /repos/{owner}/{repo}/commits` - Commit history

 **Note** : The extension uses GitHub's public API which has rate limiting for unauthenticated requests (60 requests per hour per IP). For heavy usage, you may want to add authentication.

## Privacy & Permissions

The extension requests minimal permissions:

* `activeTab`: To access the current GitHub tab
* `https://api.github.com/*`: To fetch repository data from GitHub's API
* `https://github.com/*`: To run on GitHub repository pages

**No data is collected or stored** - all information is fetched directly from GitHub's public API and displayed locally.

## Customization

### Styling

Modify `styles.css` to change the appearance:

* Colors and themes
* Layout and positioning
* Icons and typography
* Responsive breakpoints

### Functionality

Edit `content.js` to:

* Change date formatting
* Add additional repository information
* Modify where the dates are displayed
* Add caching for better performance

## Browser Compatibility

* ✅ Chrome 88+
* ✅ Edge 88+
* ✅ Firefox 109+
* ✅ Safari 14+ (with manifest conversion)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test on multiple browsers
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Troubleshooting

### Extension not working?

* Check that you're on a GitHub repository page (not organization or user profiles)
* Verify the extension is enabled in your browser settings
* Check browser console for any error messages

### API rate limiting?

* GitHub's public API allows 60 requests per hour per IP
* Consider adding GitHub authentication for higher limits
* The extension caches data to minimize API calls

### Dates not showing?

* Some repositories may have no commits yet
* Private repositories require authentication
* Check that the repository is accessible publicly
