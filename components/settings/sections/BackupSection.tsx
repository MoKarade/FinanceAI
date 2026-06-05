// components/settings/sections/BackupSection.tsx
// G22-N4 — extrait de Settings.tsx : sauvegarde & données. Export/restauration
// JSON manuel (BackupPanel), backup auto rolling IndexedDB (AutoBackupPanel) et
// mode test/fixtures (TestModePanel). Le payload de backup est construit par le
// parent (qui détient toutes les données) et passé via buildPayload.

import React from 'react';
import { BackupPanel } from '../BackupPanel';
import { AutoBackupPanel } from '../AutoBackupPanel';
import { GoogleDriveSyncCard } from '../GoogleDriveSyncCard';

interface BackupSectionProps {
  buildPayload: (opts?: { includeApiKeys?: boolean }) => Record<string, unknown>;
}

// CFG-SAUVE (retour Marc) : « Connecter à Claude » déplacé vers Clés API & Services
// (intégration) et « Mode test » vers Système & diagnostics (outil dev). Cet onglet ne
// garde que la sauvegarde/restauration et la sync.
export const BackupSection: React.FC<BackupSectionProps> = ({ buildPayload }) => {
  return (
    <div className="space-y-6">
      <BackupPanel buildPayload={buildPayload} />
      {/* P1.3 — Backup auto rolling IndexedDB (complémentaire à l'export JSON manuel) */}
      <AutoBackupPanel />
      {/* Sync Google Drive (masquée si VITE_GOOGLE_CLIENT_ID non configuré) */}
      <GoogleDriveSyncCard />
    </div>
  );
};
