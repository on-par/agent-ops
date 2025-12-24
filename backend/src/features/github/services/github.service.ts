import { Octokit } from "octokit";
import type { Config } from "../../../shared/config.js";

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
}

export interface GitHubAuthResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  user: GitHubUser;
}

export class GitHubService {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Generate the GitHub OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.githubClientId,
      redirect_uri: this.config.githubCallbackUrl,
      scope: "repo read:user user:email",
      state,
      allow_signup: "true",
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.config.githubClientId,
        client_secret: this.config.githubClientSecret,
        code,
        redirect_uri: this.config.githubCallbackUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub OAuth error: ${response.statusText}`);
    }

    const data = (await response.json()) as GitHubTokenResponse & { error?: string; error_description?: string };

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return data;
  }

  /**
   * Get authenticated user info
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.rest.users.getAuthenticated();

    return {
      id: data.id,
      login: data.login,
      avatar_url: data.avatar_url,
      name: data.name,
      email: data.email,
    };
  }

  /**
   * Complete OAuth flow: exchange code and get user info
   */
  async completeOAuthFlow(code: string): Promise<GitHubAuthResult> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    const user = await this.getUser(tokenResponse.access_token);

    const scopes = tokenResponse.scope ? tokenResponse.scope.split(",") : [];
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiresAt,
      scopes,
      user,
    };
  }

  /**
   * Create an authenticated Octokit instance
   */
  createClient(accessToken: string): Octokit {
    return new Octokit({ auth: accessToken });
  }

  /**
   * Verify a token is still valid
   */
  async verifyToken(accessToken: string): Promise<boolean> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      await octokit.rest.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }
}
