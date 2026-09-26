import { Redirect } from 'expo-router';
import { InstitutionPicker } from '../../features/InstitutionPicker';
import { peek } from '../../services/api';

// 04 Connect a bank (from 09 Accounts › Add account)
export default function AddAccount() {
  if (!peek.hasConsent()) return <Redirect href="/home" />;
  return <InstitutionPicker flow="accounts" />;
}
