'use client';

import PersonAddressManager from '../PersonAddressManager';
import type { AddressItem } from '../../hooks/usePersonForm';

interface LocationSectionProps {
  addresses: AddressItem[];
  onAddressesChange: (items: AddressItem[]) => void;
}

export default function LocationSection({
  addresses,
  onAddressesChange,
}: LocationSectionProps) {
  return (
    <PersonAddressManager
      initialAddresses={addresses}
      onChange={onAddressesChange}
    />
  );
}
