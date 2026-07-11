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
import { useResponsive } from '../../constants/layout';
import type { Today } from '../../services/types';

/** The Daily — mirrors the web Today's content order (docs/NEWSPAPER.md),
 * designed for the phone. Section order: masthead → indices → macro →
 * headlines → Alfred's brief → earnings → our market → whole market → pulse. */
export default function TodayScreen() {
  const { data: t, error, loading, refreshing, refresh, reload } = useApi<Today>('/api/today');
  const { isWide } = useResponsive();

  // Quietly re-pull every 60s while the screen lives — the server caches the
  // feed for 60s, so this is one cheap hit and the indices/movers/P&L stay live.
  React.useEffect(() => {
    const poll = setInterval(reload, 60_000);
    return () => clearInterval(poll);
  }, [reload]);

  return (
    <Screen title="Today" wide={isWide} refreshing={refreshing} onRefresh={refresh}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {t &&
        (isWide ? (
          /* iPad broadsheet: masthead + strips span the FULL width (matching the
             two-column row below), then the story sections split into two ordered
             columns (reading order kept per column). */
          <View>
            <Masthead t={t} />
            <IndicesStrip t={t} />
            <MacroStrip t={t} />
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 4, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Headlines t={t} />
                <MarketBriefSection t={t} />
                <EarningsSection t={t} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <OurMarket t={t} />
                <WholeMarket t={t} />
                <Pulse t={t} />
              </View>
            </View>
          </View>
        ) : (
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
        ))}
    </Screen>
  );
}
