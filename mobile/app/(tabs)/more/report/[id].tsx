import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SubScreen, Card, Loading, ErrorNote, Footnote } from '../../../../components/Chrome';
import MdText from '../../../../components/MdText';
import { useApi } from '../../../../services/hooks';

type Report = { id: string; kind: string; title: string; dateISO: string; bodyMarkdown: string };

/** One report, in full. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, error, loading } = useApi<Report>(`/api/reports/${id}`);

  return (
    <SubScreen title={d?.title ?? 'Report'}>
      {loading && <Loading />}
      {error && !loading && <ErrorNote message={error} />}
      {d && (
        <View style={{ marginTop: 8 }}>
          <Card>
            <MdText body={d.bodyMarkdown} foldAt={100_000} />
          </Card>
          <Footnote>{d.kind.toLowerCase()} · {d.dateISO}</Footnote>
        </View>
      )}
    </SubScreen>
  );
}
