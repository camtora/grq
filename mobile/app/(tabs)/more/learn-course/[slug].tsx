import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SubScreen, Card, MiniLabel, Footnote, Loading, ErrorNote } from '../../../../components/Chrome';
import MdText from '../../../../components/MdText';
import OrderBookSim from '../../../../components/learn/OrderBookSim';
import CompoundingSim from '../../../../components/learn/CompoundingSim';
import ReceiptBlock, { type ReceiptWire } from '../../../../components/learn/ReceiptBlock';
import { usePalette, F } from '../../../../constants/theme';
import { COURSES, courseBySlug, appHref } from '../../../../lib/learn';
import { useApi } from '../../../../services/hooks';

/** One Learn course (web /learn/[course] parity): the lessons stacked as panels,
 * markdown via MdText (every [[term]] tap-to-explain), interactive widgets (the
 * toy exchange · the compounding machine), live-fund receipts, and "see it live"
 * links mapped to app routes. */
export default function LearnCourseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { p } = usePalette();
  const router = useRouter();
  const course = courseBySlug(slug ?? '');

  // The Options course is its own portal — hop straight there (web redirect parity).
  useEffect(() => {
    if (course?.external) {
      const dest = appHref(course.external.href);
      if (dest) router.replace(dest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.slug]);

  // The live-fund receipts (fetched once; each lesson renders its own block —
  // quietly absent until the wire answers).
  const needsReceipts = (course?.lessons ?? []).some((l) => l.receipt);
  const receipts = useApi<{ blocks: Record<string, ReceiptWire> }>('/api/learn/receipts');

  if (!course) {
    return (
      <SubScreen title="Learn">
        <ErrorNote message="That course doesn't exist." />
      </SubScreen>
    );
  }

  if (course.status !== 'live') {
    return (
      <SubScreen title={`Course ${course.n} · ${course.title}`}>
        <Card style={{ marginTop: 8 }}>
          <Text style={[s.body, { color: p.textMuted }]}>
            Not written yet — this course is on the syllabus but the lessons haven&apos;t been written.
            It&apos;ll appear on the Learn hub the day it&apos;s ready — no vaporware, no placeholders.
          </Text>
        </Card>
      </SubScreen>
    );
  }

  const next = COURSES.find((c) => c.n > course.n && c.status === 'live');
  const nextDest = next ? (next.external ? appHref(next.external.href) : `/more/learn-course/${next.slug}`) : null;

  return (
    <SubScreen title={`Course ${course.n} · ${course.title}`}>
      <View style={{ marginTop: 8, gap: 12 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>{course.tagline}</Text>

        {needsReceipts && receipts.loading && <Loading />}

        {course.lessons.map((lesson, i) => (
          <View key={lesson.slug}>
            <MiniLabel>{`${i + 1} · ${lesson.title}`}</MiniLabel>
            <Card>
              <MdText body={lesson.body} foldAt={1400} />
              {lesson.widget === 'order-book' && <OrderBookSim />}
              {lesson.widget === 'compounding' && <CompoundingSim />}
              {lesson.receipt && <ReceiptBlock r={receipts.data?.blocks?.[lesson.receipt]} />}
              {(lesson.tryIt?.length ?? 0) > 0 && (
                <View style={[s.tryRow, { borderTopColor: p.cardBorder }]}>
                  {lesson.tryIt!.map((t) => {
                    const dest = appHref(t.href);
                    if (!dest) return null;
                    return (
                      <Pressable key={t.href} onPress={() => router.push(dest)}>
                        <Text style={[s.tryLink, { color: p.accentText }]}>{t.label} →</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          </View>
        ))}

        <View style={s.footRow}>
          <Text style={[s.footNote, { color: p.textMuted, flex: 1 }]}>
            Every dotted term is tap-to-explain. Something still unclear? Ask Alfred — that&apos;s what the chat
            is for.
          </Text>
          {next && nextDest && (
            <Pressable onPress={() => router.push(nextDest)}>
              <Text style={[s.nextLink, { color: p.accentText }]}>
                Next: Course {next.n} · {next.title} →
              </Text>
            </Pressable>
          )}
        </View>
        <Footnote>education only · the same lesson text the website renders</Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  body: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 19 },
  tryRow: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 6 },
  tryLink: { fontFamily: F.semi, fontSize: 12, lineHeight: 18 },
  footRow: { gap: 8 },
  footNote: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  nextLink: { fontFamily: F.semi, fontSize: 12.5 },
});
