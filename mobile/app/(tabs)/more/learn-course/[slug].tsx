import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SubScreen, Card, MiniLabel, Footnote, ErrorNote } from '../../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../../constants/theme';
import { COURSES, courseBySlug, appHref, lessonChecks, readMinutes } from '../../../../lib/learn';
import { useApi } from '../../../../services/hooks';
import { BASE_URL } from '../../../../services/api';

/** A course SYLLABUS (web /learn/[course] parity, D111): the overview, the lesson
 * list with per-member checkmarks and minutes, and the final-exam card with the
 * class's results. Lessons live on their own screens now. The external Options
 * course renders a landing for its portal — its exam still lives here. */

type LearnState = {
  done: string[];
  exams: Record<
    string,
    {
      questionCount: number;
      passPct: number;
      mine: { best: number; attempts: number; passed: boolean } | null;
      class: { name: string; photo: string | null; best: number; attempts: number; passed: boolean }[];
    }
  >;
};

function ExamCard({ slug, state, p }: { slug: string; state: LearnState | null; p: Palette }) {
  const router = useRouter();
  const exam = state?.exams?.[slug];
  return (
    <View>
      <MiniLabel>The final exam</MiniLabel>
      <Card>
        <Text style={[s.meta, { color: p.textMuted }]}>
          {exam ? `${exam.questionCount} questions · pass ≥ ${exam.passPct}%` : 'graded server-side'} · unlimited retakes — the best score
          stands, the attempt count shows.
        </Text>
        {exam?.class?.length ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {exam.class.map((r) => (
              <View key={r.name} style={s.classRow}>
                {r.photo ? (
                  <Image source={{ uri: `${BASE_URL}${r.photo}` }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, { backgroundColor: p.accent + '33', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 10 }}>{r.name.charAt(0)}</Text>
                  </View>
                )}
                <Text style={[s.className, { color: p.textPrimary }]}>{r.name}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 12, color: r.passed ? p.pos : p.warn }}>
                  {r.best}%{r.passed ? ' ✓' : ''}
                </Text>
                <Text style={[s.meta, { color: p.textMuted }]}>
                  · {r.attempts} {r.attempts === 1 ? 'attempt' : 'attempts'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Pressable onPress={() => router.push(`/more/learn-exam/${slug}` as never)} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
          <Text style={[s.btnText, { color: p.accentText }]}>{exam?.mine ? 'RETAKE THE EXAM' : 'TAKE THE EXAM'}</Text>
        </Pressable>
      </Card>
    </View>
  );
}

export default function LearnCourseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { p } = usePalette();
  const router = useRouter();
  const course = courseBySlug(slug ?? '');
  const state = useApi<LearnState>('/api/learn/state');

  if (!course) {
    return (
      <SubScreen title="Learn">
        <ErrorNote message="That course doesn't exist." />
      </SubScreen>
    );
  }

  if (course.status !== 'live') {
    return (
      <SubScreen title={course.title}>
        <Card style={{ marginTop: 8 }}>
          <Text style={[s.body, { color: p.textMuted }]}>
            Not written yet — this course is on the syllabus but the lessons haven&apos;t been written. No vaporware, no placeholders.
          </Text>
        </Card>
      </SubScreen>
    );
  }

  const doneSet = new Set((state.data?.done ?? []).filter((d) => d.startsWith(course.slug + '/')).map((d) => d.split('/')[1]));
  const next = COURSES.find((c) => c.n > course.n && c.status === 'live');

  // The external course (Options) — a landing for its portal, plus its exam.
  if (course.external) {
    const dest = appHref(course.external.href);
    return (
      <SubScreen title={course.title}>
        <View style={{ marginTop: 8, gap: 12 }}>
          <Text style={[s.intro, { color: p.textMuted }]}>{course.tagline}</Text>
          {course.overview?.length ? (
            <Card>
              <Text style={[s.overviewHead, { color: p.accentText }]}>AFTER THIS COURSE</Text>
              {course.overview.map((o) => (
                <Text key={o} style={[s.bullet, { color: p.textPrimary }]}>
                  · {o}
                </Text>
              ))}
            </Card>
          ) : null}
          <Card>
            <Text style={[s.body, { color: p.textMuted }]}>This course is taught in its own portal — lessons, the payoff calculator, and the desk experiment&apos;s live contracts.</Text>
            {dest ? (
              <Pressable onPress={() => router.push(dest as never)} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
                <Text style={[s.btnText, { color: p.accentText }]}>OPEN THE OPTIONS PORTAL</Text>
              </Pressable>
            ) : null}
          </Card>
          <ExamCard slug={course.slug} state={state.data} p={p} />
          <Footnote>education only · one exam system, eight courses</Footnote>
        </View>
      </SubScreen>
    );
  }

  return (
    <SubScreen title={course.title}>
      <View style={{ marginTop: 8, gap: 12 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>{course.tagline}</Text>

        {course.overview?.length ? (
          <Card>
            <Text style={[s.overviewHead, { color: p.accentText }]}>AFTER THIS COURSE</Text>
            {course.overview.map((o) => (
              <Text key={o} style={[s.bullet, { color: p.textPrimary }]}>
                · {o}
              </Text>
            ))}
          </Card>
        ) : null}

        <View>
          <MiniLabel>{`Lessons · ${course.lessons.length}`}</MiniLabel>
          <Card style={{ paddingVertical: 4 }}>
            {course.lessons.map((lesson, i) => {
              const done = doneSet.has(lesson.slug);
              const checks = lessonChecks(lesson).length;
              return (
                <Pressable
                  key={lesson.slug}
                  onPress={() => router.push(`/more/learn-lesson/${course.slug}/${lesson.slug}` as never)}
                  style={[s.lessonRow, i > 0 && { borderTopWidth: 1, borderTopColor: p.cardBorder }]}
                >
                  <Text style={[s.lessonN, { color: p.textMuted }]}>{i + 1}</Text>
                  <Text style={[s.lessonTitle, { color: p.textPrimary }]} numberOfLines={2}>
                    {lesson.title}
                  </Text>
                  <Text style={[s.lessonMeta, { color: p.textMuted }]}>
                    {checks ? `${checks} ${checks === 1 ? 'check' : 'checks'} · ` : ''}
                    {readMinutes(lesson)} min
                  </Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: done ? p.pos : p.cardBorder }}>✓</Text>
                </Pressable>
              );
            })}
          </Card>
        </View>

        <ExamCard slug={course.slug} state={state.data} p={p} />

        {next && (
          <Pressable
            onPress={() => router.push(`/more/learn-course/${next.slug}` as never)}
            style={[s.btn, { backgroundColor: p.accent + '26', alignSelf: 'flex-end' }]}
          >
            <Text style={[s.btnText, { color: p.accentText }]}>NEXT COURSE →</Text>
          </Pressable>
        )}
        <Footnote>every dotted term is tap-to-explain · ask Alfred when something&apos;s still unclear</Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  body: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 19 },
  meta: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  overviewHead: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 },
  bullet: { fontFamily: F.reg, fontSize: 12, lineHeight: 18 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  lessonN: { fontFamily: F.med, fontSize: 11, width: 14, textAlign: 'right' },
  lessonTitle: { fontFamily: F.semi, fontSize: 12.5, flex: 1, lineHeight: 16 },
  lessonMeta: { fontFamily: F.reg, fontSize: 9.5 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  className: { fontFamily: F.semi, fontSize: 12, width: 64 },
  btn: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 10 },
  btnText: { fontFamily: F.bold, fontSize: 11.5, letterSpacing: 1 },
});
