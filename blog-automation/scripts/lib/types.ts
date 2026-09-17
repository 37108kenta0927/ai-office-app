export interface BrandAuthor {
  name: string;
  bio: string;
}

export interface BrandLocation {
  prefecture: string;
  city: string;
  region: string;
}

export interface BrandConfig {
  id: string;
  name: string;
  siteUrl: string;
  wpUser: string;
  wpAppPasswordSecret: string;
  categories: string[];
  location?: BrandLocation;
  author: BrandAuthor;
  brandVoice: string;
  disclaimer: string;
  bookingUrl: string;
  topicsFile: string;
}

export interface Topic {
  id: string;
  title: string;
  keywords: string[];
  seasonal: boolean;
  month?: number;
  status: "pending" | "drafted" | "published";
}

export interface GeneratedPost {
  brandId: string;
  topicId: string;
  title: string;
  metaDescription: string;
  slug: string;
  bodyMarkdown: string;
  bodyHtml: string;
  jsonLd: Record<string, unknown>[];
  internalLinkSuggestions: string[];
  riskFlags: string[];
}

export interface PublishedDraft extends GeneratedPost {
  wpPostId: number;
  editLink: string;
  previewLink: string;
}
