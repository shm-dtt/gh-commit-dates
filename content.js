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
      
      // Try to show at least the repository creation date if we have it
      try {
        const repoData = await this.fetchRepoData(repoInfo.owner, repoInfo.repo);
        this.displayDateInfo({
          createdAt: repoData.created_at,
          firstCommit: null,
          lastCommit: null
        });
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        
        // Show error UI even if API fails
        this.displayDateInfo({
          createdAt: null,
          firstCommit: null,
          lastCommit: null
        });
      }
    }
  }

  async fetchRepoData(owner, repo) {
    try {
      const response = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch repo data: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error('Fetch repo data error:', error);
      throw error;
    }
  }

  async fetchCommitsData(owner, repo) {
    try {
      // Get latest commits (first page)
      const latestResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=1`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      });
      
      if (!latestResponse.ok) {
        if (latestResponse.status === 404) {
          // Repository might be empty or no commits
          return { firstCommit: null, lastCommit: null };
        }
        if (latestResponse.status === 403) {
          // API rate limit or permissions issue
          console.warn('GitHub API rate limit or permissions issue');
          return { firstCommit: null, lastCommit: null };
        }
        throw new Error(`Failed to fetch latest commits: ${latestResponse.status}`);
      }
      
      const latestCommits = await latestResponse.json();

      // If no commits exist
      if (!latestCommits || latestCommits.length === 0) {
        return { firstCommit: null, lastCommit: null };
      }

      const lastCommitDate = latestCommits[0].commit.committer.date;

      // Try to get first commit by checking pagination
      let firstCommitDate = lastCommitDate; // Default to same as last if only one commit

      // Get first page with more commits to check pagination
      const firstPageResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=100&page=1`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      });
      
      if (!firstPageResponse.ok) {
        // If we can't get the first page, just return what we have
        return { firstCommit: lastCommitDate, lastCommit: lastCommitDate };
      }

      const firstPageCommits = await firstPageResponse.json();
      
      // Check if there are more than 100 commits by looking at the Link header
      const linkHeader = firstPageResponse.headers.get('Link');
      
      if (linkHeader && linkHeader.includes('rel="last"')) {
        // Multiple pages exist, get the actual first commit
        const lastMatch = linkHeader.match(/page=(\d+)[^>]*>; rel="last"/);
        if (lastMatch) {
          const lastPage = parseInt(lastMatch[1]);
          try {
            const firstCommitResponse = await fetch(`${this.apiBase}/repos/${owner}/${repo}/commits?per_page=100&page=${lastPage}`, {
              headers: {
                'Accept': 'application/vnd.github.v3+json',
              }
            });
            if (firstCommitResponse.ok) {
              const firstCommits = await firstCommitResponse.json();
              if (firstCommits.length > 0) {
                // Get the last commit in the array (oldest commit)
                firstCommitDate = firstCommits[firstCommits.length - 1].commit.committer.date;
              }
            }
          } catch (e) {
            console.warn('Could not fetch first commit from last page, using fallback');
          }
        }
      } else if (firstPageCommits.length > 1) {
        // All commits fit on first page, get the last one
        firstCommitDate = firstPageCommits[firstPageCommits.length - 1].commit.committer.date;
      }

      return {
        firstCommit: firstCommitDate,
        lastCommit: lastCommitDate
      };

    } catch (error) {
      console.error('Error fetching commits data:', error);
      // Return null values if we can't fetch commit data
      return { firstCommit: null, lastCommit: null };
    }
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
    
    // Add a header for the sidebar version
    const header = document.createElement('h3');
    header.className = 'repo-dates-header';
    header.textContent = 'Repository Timeline';
    container.appendChild(header);
    
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
    // Wait for DOM to be ready
    setTimeout(() => {
      try {
        // Multiple fallback strategies for inserting the container
        let inserted = false;

        // Strategy 1: Try to insert in the main sidebar area
        const sidebarSelectors = [
          'div[data-testid="sidebar"]',
          '.Layout-sidebar',
          '.Layout-main .Layout-sidebar',
          '.repository-content + div',
          'aside[aria-label="Repository details"]'
        ];

        for (const selector of sidebarSelectors) {
          const sidebar = document.querySelector(selector);
          if (sidebar && !inserted) {
            try {
              // Try to insert before the About section
              const aboutSection = sidebar.querySelector('[data-testid="about-module"]');
              if (aboutSection) {
                sidebar.insertBefore(container, aboutSection);
                inserted = true;
                break;
              } else {
                // Insert at the beginning of the sidebar
                sidebar.insertBefore(container, sidebar.firstChild);
                inserted = true;
                break;
              }
            } catch (e) {
              console.warn(`Failed to insert in ${selector}:`, e);
            }
          }
        }

        // Strategy 2: If sidebar insertion failed, try main content area
        if (!inserted) {
          const mainContentSelectors = [
            '.repository-content',
            '[data-testid="repository-content"]',
            '.Box-body',
            '.Layout-main'
          ];

          for (const selector of mainContentSelectors) {
            const mainContent = document.querySelector(selector);
            if (mainContent && !inserted) {
              try {
                mainContent.insertBefore(container, mainContent.firstChild);
                inserted = true;
                break;
              } catch (e) {
                console.warn(`Failed to insert in main content ${selector}:`, e);
              }
            }
          }
        }

        // Strategy 3: Final fallback - append to body
        if (!inserted) {
          try {
            const repoHeader = document.querySelector('header.Header') || 
                             document.querySelector('.pagehead') ||
                             document.querySelector('body');
            if (repoHeader) {
              if (repoHeader.nextSibling) {
                repoHeader.parentNode.insertBefore(container, repoHeader.nextSibling);
              } else {
                repoHeader.parentNode.appendChild(container);
              }
              inserted = true;
            }
          } catch (e) {
            console.warn('Final fallback insertion failed:', e);
          }
        }

        if (!inserted) {
          console.error('Could not insert date container anywhere on the page');
        }

      } catch (error) {
        console.error('Error inserting date container:', error);
      }
    }, 500); // Small delay to ensure DOM is ready
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