/**
 * Formats a person's name with optional nickname and all name parts
 * Western format: "Name 'Nickname' MiddleName Surname SecondLastName"
 * Eastern format: "Surname SecondLastName 'Nickname' Name MiddleName"
 */
export function formatPersonName(
  name: string,
  surname?: string | null,
  middleName?: string | null,
  secondLastName?: string | null,
  nickname?: string | null,
  nameOrder?: 'WESTERN' | 'EASTERN'
): string {
  const nicknameStr = nickname ? `'${nickname}'` : null;

  if (nameOrder === 'EASTERN') {
    const parts: string[] = [];
    if (surname) parts.push(surname);
    if (secondLastName) parts.push(secondLastName);
    if (nicknameStr) parts.push(nicknameStr);
    parts.push(name);
    if (middleName) parts.push(middleName);
    return parts.join(' ');
  }

  // Western order (default)
  const parts: string[] = [name];
  if (nicknameStr) parts.push(nicknameStr);
  if (middleName) parts.push(middleName);
  if (surname) parts.push(surname);
  if (secondLastName) parts.push(secondLastName);
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
}, nameOrder?: 'WESTERN' | 'EASTERN'): string {
  return formatPersonName(
    person.name,
    person.surname,
    person.middleName,
    person.secondLastName,
    person.nickname,
    nameOrder
  );
}

/**
 * Formats a person's name for display in network graphs
 * Shows only nickname (if present) or first name, plus surname
 * This keeps graph node labels concise and readable
 */
export function formatGraphName(person: {
  name: string;
  surname?: string | null;
  nickname?: string | null;
}, nameOrder?: 'WESTERN' | 'EASTERN'): string {
  const displayName = person.nickname || person.name;

  if (!person.surname) return displayName;

  if (nameOrder === 'EASTERN') {
    return `${person.surname} ${displayName}`;
  }

  return `${displayName} ${person.surname}`;
}
