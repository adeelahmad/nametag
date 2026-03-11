'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface BackLinkProps {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
}

export default function BackLink({ fallbackHref, children, className }: BackLinkProps) {
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    const saved = sessionStorage.getItem(`backLink:${fallbackHref}`);
    if (saved) {
      setHref(saved);
    }
  }, [fallbackHref]);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
