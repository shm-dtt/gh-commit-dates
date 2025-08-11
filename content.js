// GitHub Repo Dates Extension - Content Script
class GitHubRepoDates {
  constructor() {
    this.apiBase = 'https://api.github.com';
    this.repoInfo = null;
    this.init();
  }

  init() {
    // Check if we're on a repository page
    if (this.isRepoPage()) {
      this.loadRepoData();
      // Re-run when navigating via PJAX (GitHub's navigation)
      document.addEventListener('pjax:end', () => {
        if (this.isRepoPage()) {
          this.loadRepoData();
        }
      });
    }
  }

  isRepoPage() {
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(part => part);
    // Check if we're on a repo page (owner/repo format)
    return pathParts.length >= 2 && 
           !pathParts[0].startsWith('.') && 
           !['settings', 'notifications', 'explore'].includes(pathParts[0]);
  }

  getRepoInfo() {
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(part => part);
    if (pathParts.length >= 2) {
      return {
        owner: pathParts[0],
        repo: pathParts[1]
      };
    }
    return null;
  }

  async loadRepoData() {
    const repoInfo = this.getRepoInfo();
    if (!repoInfo) return;

    // Remove existing date info if present
    this.removePreviousDateInfo();

    try {
      // Get repository info
      const repoData = await this.fetchRepoData(repoInfo.owner, repoInfo.repo);
      
      // Get commits data for first and latest commits
      const commitsData = await this.fetchCommitsData(repoInfo.owner, repoInfo.repo);

      this.displayDateInfo({
        createdAt: repoData.created_at,
        firstCommit: commitsData.firstCommit,
        lastCommit: commitsData.lastCommit
      });

    } catch (error) {
      console.error('GitHub Repo Dates Extension Error:', error);
      this.displayError();
    }
  }

  async fetchRepoData(owner, repo) {
    const response = await fetch(`${this.apiBase}/repos/${owner}/${repo}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch repo data: ${response.status}`);
    }
    return response.json();
  }

  async fetchCommitsData(owner, repo) {
    // Get latest commits (first page)
    const latestResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=1`);
    if (!latestResponse.ok) {
      throw new Error(`Failed to fetch latest commits: ${latestResponse.status}`);
    }
    const latestCommits = await latestResponse.json();

    // Get first commit by fetching the last page
    const firstResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=1&page=1`);
    if (!firstResponse.ok) {
      throw new Error(`Failed to fetch commits: ${firstResponse.status}`);
    }

    // Get total count from Link header to find the last page
    const linkHeader = firstResponse.headers.get('Link');
    let lastPage = 1;
    
    if (linkHeader) {
      const lastMatch = linkHeader.match(/page=(\d+)[^>]*>; rel="last"/);
      if (lastMatch) {
        lastPage = parseInt(lastMatch[1]);
      }
    }

    // Fetch the last page to get the first commit
    const firstCommitResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=1&page=${lastPage}`);
    if (!firstCommitResponse.ok) {
      throw new Error(`Failed to fetch first commit: ${firstCommitResponse.status}`);
    }
    const firstCommits = await firstCommitResponse.json();

    return {
      firstCommit: firstCommits.length > 0 ? firstCommits[firstCommits.length - 1].commit.committer.date : null,
      lastCommit: latestCommits.length > 0 ? latestCommits[0].commit.committer.date : null
    };
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  displayDateInfo(dates) {
    const container = this.createDateContainer();
    
    const dateInfo = [
      { label: 'Repository Created', date: dates.createdAt, icon: '📁' },
      { label: 'First Commit', date: dates.firstCommit, icon: '🎯' },
      { label: 'Latest Commit', date: dates.lastCommit, icon: '🔄' }
    ];

    dateInfo.forEach(info => {
      const dateElement = this.createDateElement(info.label, info.date, info.icon);
      container.appendChild(dateElement);
    });

    this.insertDateContainer(container);
  }

  createDateContainer() {
    const container = document.createElement('div');
    container.className = 'repo-dates-extension';
    container.id = 'repo-dates-extension';
    return container;
  }

  createDateElement(label, dateString, icon) {
    const element = document.createElement('div');
    element.className = 'repo-date-item';
    
    const formattedDate = this.formatDate(dateString);
    const timeAgo = this.getTimeAgo(dateString);
    
    element.innerHTML = `
      <span class="repo-date-icon">${icon}</span>
      <span class="repo-date-label">${label}:</span>
      <span class="repo-date-value" title="${formattedDate}">
        ${timeAgo}
      </span>
    `;
    
    return element;
  }

  getTimeAgo(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
    return `${Math.floor(diffInSeconds / 31536000)}y ago`;
  }

  insertDateContainer(container) {
    // Try to find a good location to insert the date info
    const targetSelectors = [
      '[data-testid="repository-readme"]', // Above README
      '.repository-content', // Main content area
      '#readme', // README section
      '.Box-body' // Any box body
    ];

    let targetElement = null;
    for (const selector of targetSelectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }

    if (targetElement) {
      targetElement.parentNode.insertBefore(container, targetElement);
    } else {
      // Fallback: insert after the repository header
      const repoHeader = document.querySelector('[data-testid="repository-header"]') || 
                        document.querySelector('.pagehead');
      if (repoHeader) {
        repoHeader.after(container);
      }
    }
  }

  displayError() {
    const container = this.createDateContainer();
    container.innerHTML = `
      <div class="repo-date-item error">
        <span class="repo-date-icon">⚠️</span>
        <span class="repo-date-label">Unable to load repository dates</span>
      </div>
    `;
    this.insertDateContainer(container);
  }

  removePreviousDateInfo() {
    const existing = document.getElementById('repo-dates-extension');
    if (existing) {
      existing.remove();
    }
  }
}

// Initialize the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GitHubRepoDates());
} else {
  new GitHubRepoDates();
}