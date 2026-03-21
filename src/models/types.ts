export interface InputLink {
  url: string;
  label?: string;
  id?: number;
}

export interface ScrapedArticle {
  sourceUrl: string;
  freediumUrl: string;
  title: string;
  author: string;
  publishedAt: string;
  readingTime: string;
  tags: string[];
  contentMarkdown: string;
  scrapedAt: string;
  status: "success" | "error";
  error?: string;
}
