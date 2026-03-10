/**
 * Formats a person's name with optional nickname and all name parts
 * Format: "Name 'Nickname' MiddleName Surname SecondLastName"
 * Examples:
 * - "John Smith" (no nickname, no middle names)
 * - "Charles 'Charlie' Brown" (with nickname)
 * - "John" (only name)
 * - "Matias Alejandro Godoy Biedma" (with middle name and second last name)
 */
export function formatPersonName(
  name: string,
  surname?: string | null,
  middleName?: string | null,
  secondLastName?: string | null,
  nickname?: string | null
): string {
  const parts: string[] = [name];

  if (nickname) {
    parts.push(`'${nickname}'`);
  }

  if (middleName) {
    parts.push(middleName);
  }

  if (surname) {
    parts.push(surname);
  }

  if (secondLastName) {
    parts.push(secondLastName);
  }

  return parts.join(' ');
}

/**
 * Formats a person's full name for display
 * Same as formatPersonName but with a person object
 */
export function formatFullName(person: {
  name: string;
  surname?: string | null;
  middleName?: string | null;
  secondLastName?: string | null;
  nickname?: string | null;
}): string {
  return formatPersonName(
    person.name,
    person.surname,
    person.middleName,
    person.secondLastName,
    person.nickname
  );
}

/**
 * Formats a person's name for display in network graphs
 * Shows only nickname (if present) or first name, plus surname
 * This keeps graph node labels concise and readable
 * Examples:
 * - "Matias Alejandro Godoy Biedma" → "Matias Godoy"
 * - "Matias 'Matto' Alejandro Godoy Biedma" → "Matto Godoy"
 * - "John" → "John"
 */
export function formatGraphName(person: {
  name: string;
  surname?: string | null;
  nickname?: string | null;
}): string {
  const displayName = person.nickname || person.name;
  return person.surname ? `${displayName} ${person.surname}` : displayName;
}
