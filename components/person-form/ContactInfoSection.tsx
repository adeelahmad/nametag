'use client';

import PersonPhoneManager from '../PersonPhoneManager';
import PersonEmailManager from '../PersonEmailManager';
import type { PhoneNumberItem, EmailItem } from '../../hooks/usePersonForm';

interface ContactInfoSectionProps {
  phoneNumbers: PhoneNumberItem[];
  emails: EmailItem[];
  onPhoneNumbersChange: (items: PhoneNumberItem[]) => void;
  onEmailsChange: (items: EmailItem[]) => void;
}

export default function ContactInfoSection({
  phoneNumbers,
  emails,
  onPhoneNumbersChange,
  onEmailsChange,
}: ContactInfoSectionProps) {
  return (
    <div className="space-y-4">
      <PersonPhoneManager
        initialPhones={phoneNumbers}
        onChange={onPhoneNumbersChange}
      />
      <PersonEmailManager
        initialEmails={emails}
        onChange={onEmailsChange}
      />
    </div>
  );
}
