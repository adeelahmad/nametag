'use client';

import PersonUrlManager from '../PersonUrlManager';
import type { UrlItem } from '../../hooks/usePersonForm';

interface WebsitesSectionProps {
  urls: UrlItem[];
  onUrlsChange: (items: UrlItem[]) => void;
}

export default function WebsitesSection({
  urls,
  onUrlsChange,
}: WebsitesSectionProps) {
  return <PersonUrlManager initialUrls={urls} onChange={onUrlsChange} />;
}
