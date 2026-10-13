export interface Source {
  id: number; name: string; url: string;
  type: 'rss' | 'nitter' | 'scrape'; trust_tier: 1 | 2 | 3;
  last_fetched_at: string | null; active: 0 | 1;
}
export interface Article {
  id: number; source_id: number; url: string; title: string;
  body_text: string; author: string; published_at: string;
  fetched_at: string; url_hash: string;
}
export interface Category { id: number; name: string; color: string; }
export interface ArticleWithMeta extends Article {
  source_name: string; source_trust_tier: number;
  categories: Array<{ id: number; name: string; color: string; confidence: number }>;
  credibility?: {
    score: number;
    tier: number;
    flags: string[];
    explanation: string;
  };
}
export interface CredibilityScore {
  article_id: number;
  score: number;
  tier: number;
  flags: string[];
  explanation: string;
  checked_at: string;
}
export interface SearchParams {
  query?: string; category_id?: number;
  sort_by: 'date' | 'relevance' | 'source'; limit: number; offset: number;
}
export const IPC = {
  SOURCES_LIST: 'sources:list', SOURCES_CREATE: 'sources:create',
  SOURCES_UPDATE: 'sources:update', SOURCES_DELETE: 'sources:delete',
  SOURCES_FETCH_NOW: 'sources:fetch-now', ARTICLES_FEED: 'articles:feed',
  ARTICLES_SEARCH: 'articles:search', CATEGORIES_LIST: 'categories:list',
  CATEGORIES_CREATE: 'categories:create', CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  CATEGORIES_ADD_KEYWORD: 'categories:add-keyword',
  CATEGORIES_REMOVE_KEYWORD: 'categories:remove-keyword',
  CATEGORIES_LIST_KEYWORDS: 'categories:list-keywords',
} as const
