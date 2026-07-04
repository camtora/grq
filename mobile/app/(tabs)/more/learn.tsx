import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { COURSES, LABS, GLOSSARY, appHref } from '../../../lib/learn';
import { useApi } from '../../../services/hooks';
import { BASE_URL } from '../../../services/api';

type LearnState = {
  done: string[];
  exams: Record<string, { mine: { best: number; attempts: number; passed: boolean } | null }>;
  standings: {
    name: string;
    photo: string | null;
    lessonsDone: number;
    coursesPassed: number;
    perCourse: { courseSlug: string; best: number | null; attempts: number; passed: boolean }[];
  }[];
  examCount: number;
};

/** The Learn hub (web /learn parity, D110) — the front door for the financial-
 * literacy pillar: the market-mechanics curriculum, the labs framed by what each
 * teaches, the browsable glossary, and Ask Alfred. Teaches how the market WORKS,
 * not which stocks to buy. Content is the SAME learn.json the web renders. */

const PROMPTS = [
  'What actually happens, step by step, when the fund buys a share?',
  'Why is there always a bid AND an ask instead of one price?',
  'If a stock jumps 5% overnight, who moved it while the market was closed?',
  'Why does GRQ measure itself against just buying XIC?',
];

function CourseCard({ c, p, state }: { c: (typeof COURSES)[number]; p: Palette; state: LearnState | null }) {
  const router = useRouter();
  const live = c.status === 'live';
  // Every live course routes to its syllabus now — the Options syllabus carries the
  // portal link AND its exam (web parity, D111).
  const dest = `/more/learn-course/${c.slug}`;
  const done = (state?.done ?? []).filter((d) => d.startsWith(c.slug + '/')).length;
  const exam = state?.exams?.[c.slug]?.mine ?? null;
  const foot =
    c.status === 'soon'
      ? 'soon'
      : c.external
        ? `the portal + its exam${exam ? ` · ${exam.best}%${exam.passed ? ' ✓' : ''}` : ''} →`
        : `${state ? `${done}/${c.lessons.length}` : c.lessons.length} lessons · exam${exam ? ` ${exam.best}%${exam.passed ? ' ✓' : ''}` : ''} →`;
  return (
    <Pressable onPress={live ? () => router.push(dest as never) : undefined} style={[s.courseCell, !live && { opacity: 0.55 }]}>
      <Card style={{ flex: 1 }}>
        <Text style={[s.courseN, { color: p.accentText }]}>COURSE {c.n}</Text>
        <Text style={[s.courseTitle, { color: p.textPrimary }]}>{c.title}</Text>
        <Text style={[s.courseTag, { color: p.textMuted }]} numberOfLines={3}>
          {c.tagline}
        </Text>
        <Text style={[s.courseFoot, { color: exam?.passed ? p.pos : p.accentText }]}>{foot}</Text>
      </Card>
    </Pressable>
  );
}

function Standings({ state, p }: { state: LearnState; p: Palette }) {
  const totalLessons = COURSES.reduce((n, c) => n + c.lessons.length, 0);
  const byN = new Map(COURSES.map((c) => [c.slug, c.n]));
  return (
    <Card>
      <View style={{ gap: 12 }}>
        {state.standings.map((r) => (
          <View key={r.name} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.photo ? (
                <Image source={{ uri: `${BASE_URL}${r.photo}` }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, { backgroundColor: p.accent + '33', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: p.accentText, fontFamily: F.bold, fontSize: 11 }}>{r.name.charAt(0)}</Text>
                </View>
              )}
              <Text style={{ fontFamily: F.semi, fontSize: 13, color: p.textPrimary }}>{r.name}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: 10.5, color: p.textMuted }}>
                {r.coursesPassed}/{state.examCount} courses · {r.lessonsDone}/{totalLessons} lessons
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {r.perCourse.map((c) => (
                <View
                  key={c.courseSlug}
                  style={[
                    s.chip,
                    {
                      borderColor: c.best === null ? p.cardBorder : c.passed ? p.pos + '77' : p.warn + '77',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: F.med,
                      fontSize: 9.5,
                      color: c.best === null ? p.textMuted : c.passed ? p.pos : p.warn,
                    }}
                  >
                    C{byN.get(c.courseSlug) ?? '?'} {c.best === null ? '—' : `${c.best}%${c.attempts > 1 ? ` ·${c.attempts}×` : ''}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        <Text style={{ fontFamily: F.reg, fontSize: 9.5, lineHeight: 14, color: p.textMuted }}>
          Pass is 80%. Retakes are unlimited and the best score stands — but the attempt count is part of the record.
        </Text>
      </View>
    </Card>
  );
}

export default function LearnHubScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const termCount = Object.keys(GLOSSARY).length;
  const state = useApi<LearnState>('/api/learn/state');

  return (
    <SubScreen title="Learn">
      <View style={{ marginTop: 8, gap: 10 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          How the market actually works — not which stocks to buy. Courses in plain English, every term
          tap-to-explain, and live experiments to watch the ideas play out.
        </Text>

        {/* the curriculum — two-wide grid */}
        <SectionTitle sub="eight courses, in order — start at market structure">The curriculum</SectionTitle>
        <View style={s.grid}>
          {COURSES.map((c) => (
            <CourseCard key={c.slug} c={c} p={p} state={state.data} />
          ))}
        </View>

        {/* the class — published scores, attempt counts included */}
        {state.data?.standings?.length ? (
          <>
            <SectionTitle sub="scores published, attempt counts included — that's the honesty policy">The class</SectionTitle>
            <Standings state={state.data} p={p} />
          </>
        ) : null}

        {/* the labs */}
        <SectionTitle sub="learn by watching experiments run against the real market">The labs</SectionTitle>
        <View style={{ gap: 8 }}>
          {LABS.map((lab) => {
            const dest = appHref(lab.href);
            if (!dest) return null;
            return (
              <Pressable key={lab.href} onPress={() => router.push(dest)}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.labTitle, { color: p.textPrimary }]}>{lab.title}</Text>
                      <Text style={[s.labTeaches, { color: p.textMuted }]}>{lab.teaches}</Text>
                    </View>
                    <Text style={{ color: p.accentText, fontFamily: F.semi, fontSize: 13 }}>→</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {/* the glossary */}
        <SectionTitle sub={`${termCount} terms and counting`}>The glossary</SectionTitle>
        <Card>
          <Text style={[s.body, { color: p.textMuted }]}>
            Every piece of jargon GRQ puts on screen, defined in plain English with an example — the same
            definitions behind every dotted-underlined term in the app. A figure the app shows but can&apos;t
            explain is a bug.
          </Text>
          <Pressable onPress={() => router.push('/more/learn-glossary')} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
            <Text style={[s.btnText, { color: p.accentText }]}>Browse the glossary</Text>
          </Pressable>
        </Card>

        {/* ask */}
        <SectionTitle sub="any of this, in plain English, on demand">Ask Alfred</SectionTitle>
        <Card>
          <Text style={[s.body, { color: p.textMuted }]}>
            Alfred can explain anything in these courses — or anything on any page. Start with one of these,
            or just ask:
          </Text>
          <View style={s.promptWrap}>
            {PROMPTS.map((q) => (
              <Pressable
                key={q}
                onPress={() => router.push({ pathname: '/chat', params: { prompt: q } })}
                style={[s.promptChip, { borderColor: p.cardBorder, backgroundColor: p.cardHi }]}
              >
                <Text style={[s.promptText, { color: p.textMuted }]}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => router.push('/chat')} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
            <Text style={[s.btnText, { color: p.accentText }]}>Ask Alfred</Text>
          </Pressable>
        </Card>

        <Footnote>
          education only — none of this touches the order gate, the broker, or the fund · the same lesson
          text the website renders, so the two can never drift
        </Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  intro: { fontFamily: F.reg, fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  courseCell: { width: '48.7%', flexGrow: 1, flexBasis: '47%' },
  courseN: { fontFamily: F.bold, fontSize: 8.5, letterSpacing: 1.5 },
  courseTitle: { fontFamily: F.semi, fontSize: 14, marginTop: 4 },
  courseTag: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 14.5, marginTop: 4 },
  courseFoot: { fontFamily: F.semi, fontSize: 10.5, marginTop: 8 },
  labTitle: { fontFamily: F.semi, fontSize: 13.5 },
  labTeaches: { fontFamily: F.reg, fontSize: 11, lineHeight: 15.5, marginTop: 3 },
  body: { fontFamily: F.reg, fontSize: 12.5, lineHeight: 19 },
  btn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8, marginTop: 10 },
  btnText: { fontFamily: F.semi, fontSize: 12 },
  promptWrap: { gap: 6, marginTop: 10 },
  promptChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  promptText: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  chip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2.5 },
});
