import { Badge } from '../components/ui';
import type { ConnectionStatus } from '../services/api';

/** Status is always text + icon, never colour alone. */
export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  switch (status) {
    case 'active':
      return <Badge tone="success" icon="check" label="Up to date" />;
    case 'stale':
      return <Badge tone="warn" icon="clock" label="Out of date" />;
    case 'reauth_required':
      return <Badge tone="danger" icon="warn" label="Reconnect needed" />;
    case 'error':
      return <Badge tone="danger" icon="warn" label="Sync failed" />;
    case 'awaiting_authorisation':
      return <Badge tone="neutral" icon="clock" label="Not finished" />;
  }
}
