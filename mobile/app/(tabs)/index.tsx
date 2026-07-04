import React from 'react';
import { View } from 'react-native';
import { Screen, Loading, ErrorNote } from '../../components/Chrome';
import {
  Masthead,
  IndicesStrip,
  MacroStrip,
  Headlines,
  MarketBriefSection,
  EarningsSection,
  OurMarket,
  WholeMarket,
  Pulse,
} from '../../components/today/sections';
import { useApi } from '../../services/hooks';
import type { Today } from '../../services/types';

/** The Daily — mirrors the web Today's content order (docs/NEWSPAPER.md),
 * designed for the phone. Section order: masthead → indices → macro →
 * headlines → Alfred's brief → earnings → our market → whole market → pulse. */
export default function TodayScreen() {
  const { data: t, error, loading, refreshing, refresh, reload } = useApi<Today>('/api/today');

  // Quietly re-pull every 60s while the screen lives — the server caches the
  // feed for 60s, so this is one cheap hit and the indices/movers/P&L stay live.
  React.useEffect(() => {
    const poll = setInterval(reload, 60_000);
    return () => clearInterval(poll);
  }, [reload]);

  return (
    <Screen title="Today" refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {t && (
        <View>
          <Masthead t={t} />
          <IndicesStrip t={t} />
          <MacroStrip t={t} />
          <Headlines t={t} />
          <MarketBriefSection t={t} />
          <EarningsSection t={t} />
          <OurMarket t={t} />
          <WholeMarket t={t} />
          <Pulse t={t} />
        </View>
      )}
    </Screen>
  );
}
