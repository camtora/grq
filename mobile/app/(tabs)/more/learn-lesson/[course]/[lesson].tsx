import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SubScreen, Card, MiniLabel, Footnote, ErrorNote } from '../../../../../components/Chrome';
import { usePalette, F } from '../../../../../constants/theme';
import { courseBySlug, lessonChecks, ledeMd, readMinutes } from '../../../../../lib/learn';
import LearnBlock from '../../../../../components/learn/LearnBlocks';
import LearnCheck from '../../../../../components/learn/LearnCheck';
import { type ReceiptWire } from '../../../../../components/learn/ReceiptBlock';
import { useApi } from '../../../../../services/hooks';
import { api } from '../../../../../services/api';

/** One lesson on its own page (web /learn/[course]/[lesson] parity, D111 L5): the
 * block sequence rendered natively, the Check-yourself section (answering every
 * check completes the lesson — same rule as web), prev/next, the final-exam hop,
 * and a lesson-scoped Ask Alfred. */

type LearnState = {
  done: string[];
  examples: Record<string, { md: string; asOf: string }>;
  exams: Record<string, { questionCount: number }>;
};

export default function LearnLessonScreen() {
  const { course: courseSlug, lesson: lessonSlug } = useLocalSearchParams<{ course: string; lesson: string }>();
  const { p } = usePalette();
  const router = useRouter();

  const course = courseBySlug(courseSlug ?? '');
  const i = course?.lessons.findIndex((l) => l.slug === lessonSlug) ?? -1;
  const lesson = i >= 0 ? course!.lessons[i] : undefined;

  const needsReceipts = (lesson?.blocks ?? []).some((b) => b.kind === 'receipt');
  const receipts = useApi<{ blocks: Record<string, ReceiptWire> }>(needsReceipts ? '/api/learn/receipts' : '/api/learn/receipts');
  const state = useApi<LearnState>('/api/learn/state');

  const checks = useMemo(() => (lesson ? lessonChecks(lesson) : []), [lesson]);
  const answered = useRef(new Set<string>());
  const [answeredCount, setAnsweredCount] = useState(0);
  const [doneLocal, setDoneLocal] = useState(false);
  const posted = useRef(false);

  if (!course || !lesson) {
    return (
      <SubScreen title="Learn">
        <ErrorNote message="That lesson doesn't exist." />
      </SubScreen>
    );
  }

  const doneAlready = doneLocal || (state.data?.done ?? []).includes(`${course.slug}/${lesson.slug}`);

  const complete = async () => {
    if (posted.current) return;
    posted.current = true;
    try {
      await api('/api/learn/progress', { method: 'POST', body: JSON.stringify({ course: course.slug, lesson: lesson.slug }) });
      setDoneLocal(true);
    } catch {
      posted.current = false;
    }
  };

  const onAnswered = (qid: string) => {
    if (answered.current.has(qid)) return;
    answered.current.add(qid);
    setAnsweredCount(answered.current.size);
    if (answered.current.size >= checks.length && !doneAlready) void complete();
  };

  const prev = i > 0 ? course.lessons[i - 1] : null;
  const next = i < course.lessons.length - 1 ? course.lessons[i + 1] : null;
  // The magazine lede (web parity): first two words of the opening prose go bold-caps.
  const content = lesson.blocks
    .filter((b) => b.kind !== 'check')
    .map((b, bi) => (bi === 0 && b.kind === 'prose' ? { ...b, md: ledeMd(b.md) } : b));

  return (
    <SubScreen title={lesson.title}>
      <View style={{ marginTop: 8, gap: 12 }}>
        <Text style={[s.sub, { color: p.textMuted }]}>
          {course.title} — lesson {i + 1} of {course.lessons.length} · ~{readMinutes(lesson)} min
        </Text>

        <Card>
          {content.map((b, bi) => (
            <LearnBlock key={bi} block={b} receipts={receipts.data?.blocks} examples={state.data?.examples} lede={bi === 0} />
          ))}
        </Card>

        {checks.length > 0 && (
          <View>
            <MiniLabel>Check yourself</MiniLabel>
            <View style={{ gap: 10 }}>
              {checks.map((q) => (
                <LearnCheck key={q.id} q={q} onAnswered={onAnswered} />
              ))}
            </View>
            <Text style={[s.progress, { color: doneAlready ? p.pos : p.textMuted }]}>
              {doneAlready
                ? '✓ Lesson complete'
                : `Answer the ${checks.length === 1 ? 'check' : `${checks.length} checks`} to complete this lesson${
                    checks.length > 1 ? ` · ${answeredCount}/${checks.length}` : ''
                  }`}
            </Text>
          </View>
        )}

        {/* Every nav affordance says exactly what it does, in a clear large button
            (Cam 2026-07-04, web parity). */}
        <View style={s.navRow}>
          {prev ? (
            <Pressable
              onPress={() => router.push(`/more/learn-lesson/${course.slug}/${prev.slug}` as never)}
              style={[s.navBtn, { borderColor: p.cardBorder }]}
            >
              <Text style={[s.navBtnText, { color: p.textMuted }]}>← PREVIOUS LESSON</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {next ? (
            <Pressable
              onPress={() => router.push(`/more/learn-lesson/${course.slug}/${next.slug}` as never)}
              style={[s.navBtn, { backgroundColor: p.accent + '26', borderColor: p.accent + '44' }]}
            >
              <Text style={[s.navBtnText, { color: p.accentText }]}>NEXT LESSON →</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push(`/more/learn-exam/${course.slug}` as never)}
              style={[s.navBtn, { backgroundColor: p.accent + '26', borderColor: p.accent + '44' }]}
            >
              <Text style={[s.navBtnText, { color: p.accentText }]}>TAKE THE EXAM →</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: { prompt: `I'm reading the Learn lesson “${lesson.title}” (${course.title}). Walk me through the core idea with a fresh, current example.` },
            })
          }
          style={[s.navBtn, { borderColor: p.cardBorder, alignSelf: 'center' }]}
        >
          <Text style={[s.navBtnText, { color: p.textMuted }]}>ASK ALFRED ABOUT THIS LESSON</Text>
        </Pressable>

        <Footnote>education only · the same lesson the website renders, blocks and all</Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  sub: { fontFamily: F.reg, fontSize: 11, lineHeight: 15 },
  progress: { fontFamily: F.semi, fontSize: 10.5, marginTop: 8 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  navBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  navBtnText: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1 },
});
