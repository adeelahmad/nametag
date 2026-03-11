import { describe, it, expect } from 'vitest';
import { findDuplicates, findAllDuplicateGroups } from '@/lib/duplicate-detection';

describe('duplicate-detection with accents', () => {
  it('should detect accented and unaccented names as duplicates', () => {
    const people = [
      { id: '1', name: 'María', surname: 'García' },
      { id: '2', name: 'Maria', surname: 'Garcia' },
    ];

    const duplicates = findDuplicates('María', 'García', people, '1');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].personId).toBe('2');
    expect(duplicates[0].similarity).toBe(1);
  });

  it('should group accented variants together', () => {
    const people = [
      { id: '1', name: 'María', surname: 'García' },
      { id: '2', name: 'Maria', surname: 'Garcia' },
      { id: '3', name: 'John', surname: 'Smith' },
    ];

    const groups = findAllDuplicateGroups(people);
    expect(groups).toHaveLength(1);
    expect(groups[0].people).toHaveLength(2);
    expect(groups[0].similarity).toBe(1);
  });
});
