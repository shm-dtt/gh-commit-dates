// GitHub Repo Dates Extension - Content Script
class GitHubRepoDates {
  constructor() {
    this.apiBase = "https://api.github.com";
    this.repoInfo = null;
    this.cachedData = new Map(); // Cache for repository data
    this.currentlyLoading = null; // Prevent duplicate loading
    this.lastProcessedPath = null; // Prevent duplicate processing
    this.init();
  }

  init() {
    // Initial load
    this.handlePageLoad();

    // Listen for GitHub's navigation events
    this.setupNavigationListeners();
  }

  setupNavigationListeners() {
    // GitHub uses multiple navigation methods
    document.addEventListener("pjax:end", () => this.handlePageLoad());
    document.addEventListener("turbo:load", () => this.handlePageLoad());

    // Also listen for popstate for back/forward navigation
    window.addEventListener("popstate", () => {
      setTimeout(() => this.handlePageLoad(), 100);
    });

    // Watch for URL changes (for SPAs)
    let currentUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => this.handlePageLoad(), 200);
      }
    });

    urlObserver.observe(document, { subtree: true, childList: true });
  }

  handlePageLoad() {
    // Small delay to ensure DOM is ready and prevent duplicate triggers
    setTimeout(() => {
      // Check if we're already processing this page
      const currentPath = window.location.pathname;
      if (this.lastProcessedPath === currentPath) {
        return;
      }
      this.lastProcessedPath = currentPath;

      if (this.isRepoPage() && this.isCodeTab()) {
        this.loadRepoData();
      } else {
        this.removePreviousDateInfo();
      }
    }, 300);
  }

  isRepoPage() {
    const path = window.location.pathname;
    const pathParts = path.split("/").filter((part) => part);
    // Check if we're on a repo page (owner/repo format)
    return (
      pathParts.length >= 2 &&
      !pathParts[0].startsWith(".") &&
      ![
        "settings",
        "notifications",
        "explore",
        "marketplace",
        "pricing",
      ].includes(pathParts[0])
    );
  }

  isCodeTab() {
    const path = window.location.pathname;
    const pathParts = path.split("/").filter((part) => part);

    // Main repository page (no additional path segments or just owner/repo)
    if (pathParts.length === 2) return true;

    // Tree view (browsing folders)
    if (pathParts.length > 2 && pathParts[2] === "tree") return true;

    // Blob view (viewing files) - don't show here
    if (pathParts.length > 2 && pathParts[2] === "blob") return false;

    // Other tabs like issues, pull requests, etc.
    if (
      pathParts.length > 2 &&
      [
        "issues",
        "pull",
        "actions",
        "projects",
        "security",
        "insights",
        "settings",
      ].includes(pathParts[2])
    ) {
      return false;
    }

    return true;
  }

  getRepoInfo() {
    const path = window.location.pathname;
    const pathParts = path.split("/").filter((part) => part);
    if (pathParts.length >= 2) {
      return {
        owner: pathParts[0],
        repo: pathParts[1],
        key: `${pathParts[0]}/${pathParts[1]}`,
      };
    }
    return null;
  }

  async loadRepoData() {
    const repoInfo = this.getRepoInfo();
    if (!repoInfo) return;

    // Prevent duplicate loading
    if (this.currentlyLoading === repoInfo.key) return;
    this.currentlyLoading = repoInfo.key;

    // Remove existing date info if present
    this.removePreviousDateInfo();

    // Check cache first
    if (this.cachedData.has(repoInfo.key)) {
      const cachedDates = this.cachedData.get(repoInfo.key);
      this.displayDateInfo(cachedDates);
      this.currentlyLoading = null;
      return;
    }

    try {
      // Get repository info
      const repoData = await this.fetchRepoData(repoInfo.owner, repoInfo.repo);

      // Get commits data for first and latest commits
      const commitsData = await this.fetchCommitsData(
        repoInfo.owner,
        repoInfo.repo
      );

      const dates = {
        createdAt: repoData.created_at,
        firstCommit: commitsData.firstCommit,
        lastCommit: commitsData.lastCommit,
      };

      // Cache the data
      this.cachedData.set(repoInfo.key, dates);

      this.displayDateInfo(dates);
      this.currentlyLoading = null;
    } catch (error) {
      console.error("GitHub Repo Dates Extension Error:", error);

      // Try to show at least the repository creation date if we have it
      try {
        const repoData = await this.fetchRepoData(
          repoInfo.owner,
          repoInfo.repo
        );
        const dates = {
          createdAt: repoData.created_at,
          firstCommit: null,
          lastCommit: null,
        };
        this.cachedData.set(repoInfo.key, dates);
        this.displayDateInfo(dates);
        this.currentlyLoading = null;
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        this.displayError();
        this.currentlyLoading = null;
      }
    }
  }

  async fetchRepoData(owner, repo) {
    try {
      const response = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch repo data: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error("Fetch repo data error:", error);
      throw error;
    }
  }

  async fetchCommitsData(owner, repo) {
    try {
      // Get latest commits (first page)
      const latestResponse = await fetch(
        `${this.apiBase}/repos/${owner}/${repo}/commits?per_page=1`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!latestResponse.ok) {
        if (latestResponse.status === 404 || latestResponse.status === 409) {
          // Repository might be empty or no commits
          return { firstCommit: null, lastCommit: null };
        }
        if (latestResponse.status === 403) {
          // API rate limit or permissions issue
          console.warn("GitHub API rate limit or permissions issue");
          return { firstCommit: null, lastCommit: null };
        }
        throw new Error(
          `Failed to fetch latest commits: ${latestResponse.status}`
        );
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
      const firstPageResponse = await fetch(
        `${this.apiBase}/repos/${owner}/${repo}/commits?per_page=100&page=1`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!firstPageResponse.ok) {
        // If we can't get the first page, just return what we have
        return { firstCommit: lastCommitDate, lastCommit: lastCommitDate };
      }

      const firstPageCommits = await firstPageResponse.json();

      // Check if there are more than 100 commits by looking at the Link header
      const linkHeader = firstPageResponse.headers.get("Link");

      if (linkHeader && linkHeader.includes('rel="last"')) {
        // Multiple pages exist, get the actual first commit
        const lastMatch = linkHeader.match(/page=(\d+)[^>]*>; rel="last"/);
        if (lastMatch) {
          const lastPage = parseInt(lastMatch[1]);
          try {
            const firstCommitResponse = await fetch(
              `${this.apiBase}/repos/${owner}/${repo}/commits?per_page=100&page=${lastPage}`,
              {
                headers: {
                  Accept: "application/vnd.github.v3+json",
                },
              }
            );
            if (firstCommitResponse.ok) {
              const firstCommits = await firstCommitResponse.json();
              if (firstCommits.length > 0) {
                // Get the last commit in the array (oldest commit)
                firstCommitDate =
                  firstCommits[firstCommits.length - 1].commit.committer.date;
              }
            }
          } catch (e) {
            console.warn(
              "Could not fetch first commit from last page, using fallback"
            );
          }
        }
      } else if (firstPageCommits.length > 1) {
        // All commits fit on first page, get the last one
        firstCommitDate =
          firstPageCommits[firstPageCommits.length - 1].commit.committer.date;
      }

      return {
        firstCommit: firstCommitDate,
        lastCommit: lastCommitDate,
      };
    } catch (error) {
      console.error("Error fetching commits data:", error);
      // Return null values if we can't fetch commit data
      return { firstCommit: null, lastCommit: null };
    }
  }

  formatDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  displayDateInfo(dates) {
    // Wait for sidebar to be available
    let attempts = 0;
    const maxAttempts = 10;

    const tryInsert = () => {
      if (this.insertIntoSidebar(dates) || attempts >= maxAttempts) {
        return;
      }
      attempts++;
      setTimeout(tryInsert, 200);
    };

    tryInsert();
  }

  insertIntoSidebar(dates) {
    // First check if it already exists
    if (document.getElementById("repo-dates-extension")) {
      return true; // Already inserted
    }

    // Look for GitHub's sidebar structure more precisely
    const sidebarSelectors = [
      'div[data-testid="repository-sidebar"]',
      ".Layout-sidebar .BorderGrid-cell",
      ".Layout-sidebar",
      'aside[aria-label="Repository details"]',
    ];

    for (const selector of sidebarSelectors) {
      const sidebar = document.querySelector(selector);
      if (sidebar) {
        const container = this.createGitHubStyleContainer(dates);

        // Try to insert before About section or at the beginning
        const aboutSection =
          sidebar.querySelector('[data-testid="about-module"]') ||
          sidebar.querySelector(".BorderGrid-row") ||
          sidebar.firstElementChild;

        if (aboutSection) {
          sidebar.insertBefore(container, aboutSection);
        } else {
          sidebar.insertBefore(container, sidebar.firstChild);
        }

        return true;
      }
    }

    return false;
  }

  createGitHubStyleContainer(dates) {
    const container = document.createElement("div");
    container.className = "BorderGrid-row repo-dates-extension";
    container.id = "repo-dates-extension";

    const cell = document.createElement("div");
    cell.className = "BorderGrid-cell";

    // Create the main content box that matches GitHub's About section
    const box = document.createElement("div");
    box.className = "Box Box--condensed";

    // Header
    const header = document.createElement("div");
    header.className = "Box-header";
    const title = document.createElement("h2");
    title.className = "Box-title";
    title.textContent = "Repository Timeline";
    header.appendChild(title);
    box.appendChild(header);

    // Body with dates
    const body = document.createElement("div");
    body.className = "Box-body";

    const dateInfo = [
      {
        label: "Repository Created",
        date: dates.createdAt,
        icon: this.createOcticonSVG("repo"),
      },
      {
        label: "First Commit",
        date: dates.firstCommit,
        icon: this.createOcticonSVG("git-commit"),
      },
      {
        label: "Latest Commit",
        date: dates.lastCommit,
        icon: this.createOcticonSVG("history"),
      },
    ];

    dateInfo.forEach((info, index) => {
      const dateElement = this.createGitHubStyleDateElement(
        info.label,
        info.date,
        info.icon
      );
      body.appendChild(dateElement);

      // Add separator except for last item
      if (index < dateInfo.length - 1) {
        const separator = document.createElement("div");
        separator.className = "border-top color-border-muted mt-3 pt-3";
        dateElement.appendChild(separator);
      }
    });

    box.appendChild(body);
    cell.appendChild(box);
    container.appendChild(cell);

    return container;
  }

  createGitHubStyleDateElement(label, dateString, iconSvg) {
    const element = document.createElement("div");
    element.className =
      "d-flex flex-items-center text-small color-fg-muted mb-3";

    const formattedDate = this.formatDate(dateString);
    const timeAgo = this.getTimeAgo(dateString);

    element.innerHTML = `
      <span class="flex-shrink-0 mr-2">${iconSvg}</span>
      <span class="flex-auto">${label}</span>
      <span class="color-fg-default" title="${formattedDate}">
        ${timeAgo}
      </span>
    `;

    return element;
  }

  createOcticonSVG(iconName) {
    const icons = {
      repo: '<svg class="octicon octicon-repo" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8.5ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path></svg>',
      "git-commit":
        '<svg class="octicon octicon-git-commit" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M10.5 7.75a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"></path><path d="M8 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path></svg>',
      history:
        '<svg class="octicon octicon-history" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="m.427 1.927 1.215 1.215a8.002 8.002 0 1 1-2.6 5.685.75.75 0 1 1 1.493-.154 6.5 6.5 0 1 0 2.042-4.621L1.414 5.414A.25.25 0 0 1 1.25 5H.25A.25.25 0 0 1 0 4.75V.25C0 .112.112 0 .25 0h4.5a.25.25 0 0 1 .177.427l-.898.898a7.5 7.5 0 1 1-3.602 0Z"></path></svg>',
    };

    return icons[iconName] || icons["repo"];
  }

  getTimeAgo(dateString) {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000)
      return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 31536000)
      return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
    return `${Math.floor(diffInSeconds / 31536000)}y ago`;
  }

  displayError() {
    const container = this.createGitHubStyleContainer({
      createdAt: null,
      firstCommit: null,
      lastCommit: null,
    });

    // Replace the content with error message
    const body = container.querySelector(".Box-body");
    body.innerHTML = `
      <div class="d-flex flex-items-center text-small color-fg-muted">
        <span class="flex-shrink-0 mr-2">⚠️</span>
        <span>Unable to load repository dates</span>
      </div>
    `;

    this.insertIntoSidebar({
      createdAt: null,
      firstCommit: null,
      lastCommit: null,
    });
  }

  removePreviousDateInfo() {
    // Remove all instances to be safe
    const existingElements = document.querySelectorAll(
      "#repo-dates-extension, .repo-dates-extension"
    );
    existingElements.forEach((el) => el.remove());
  }
}

// Initialize the extension
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new GitHubRepoDates());
} else {
  new GitHubRepoDates();
}
