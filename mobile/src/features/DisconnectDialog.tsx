import { Text, View } from 'react-native';
import { Button, Dialog, ErrorBanner, Muted } from '../components/ui';
import { kindLabel } from '../data/mock';
import { ConnectionView, deleteConnection, getInsights } from '../services/api';
import { useMutation, useQuery } from '../services/useQuery';
import { colors, fonts } from '../theme';

// S3 Disconnect a bank — dialog on 09 Accounts and E3
export function DisconnectDialog({ conn, onClose, onDone }: { conn: ConnectionView | null; onClose: () => void; onDone?: () => void }) {
  const del = useMutation(deleteConnection);
  const insights = useQuery(getInsights);
  if (!conn) return null;
  const accounts = conn.accounts;
  // Name an insight that will disappear, if this bank's accounts are part of its evidence.
  const lost = (insights.data ?? []).find((i) => accounts.some((a) => i.basedOn.some((b) => b.endsWith(a.name))));

  return (
    <Dialog visible title={`Disconnect ${conn.institution.name}?`} onRequestClose={onClose}>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink }}>
        BACI will stop syncing and remove its copy of the transactions for:
      </Text>
      <View style={{ gap: 2, paddingLeft: 4 }}>
        {accounts.length ? (
          accounts.map((a) => (
            <Text key={a.id} style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ink }}>
              • {a.name} ({kindLabel[a.kind]})
            </Text>
          ))
        ) : (
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.ink }}>• No accounts were selected</Text>
        )}
      </View>
      <Muted style={{ fontSize: 13.5, lineHeight: 19 }}>
        {`Your other accounts and your profile stay as they are. Insights and answers will be recalculated without these accounts${lost ? ` — for example, “${lost.title}” will disappear` : ''}.`}
      </Muted>
      <ErrorBanner error={del.error} />
      <Button
        label={del.busy ? 'Disconnecting…' : 'Disconnect'}
        disabled={del.busy}
        style={{ backgroundColor: colors.dangerFg }}
        onPress={async () => {
          if ((await del.run(conn.id)).ok) {
            onClose();
            onDone?.();
          }
        }}
      />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </Dialog>
  );
}
