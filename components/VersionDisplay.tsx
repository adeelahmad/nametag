import { getVersion, isPreRelease } from '@/lib/version';

interface VersionDisplayProps {
  className?: string;
  showPrefix?: boolean;
}

/**
 * Display the current application version
 * Can be used in footer, about page, etc.
 */
export default function VersionDisplay({
  className = '',
  showPrefix = true
}: VersionDisplayProps) {
  const version = getVersion();
  const isPre = isPreRelease();
  const display = showPrefix ? `v${version}` : version;

  return (
    <span
      className={className}
      title={isPre ? 'Pre-release version' : 'Current version'}
    >
      {display}
      {isPre && (
        <span className="ml-1 text-xs opacity-75">
          (pre-release)
        </span>
      )}
    </span>
  );
}
