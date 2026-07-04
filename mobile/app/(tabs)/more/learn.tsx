import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SubScreen, Card, SectionTitle, Footnote } from '../../../components/Chrome';
import { usePalette, F, type Palette } from '../../../constants/theme';
import { COURSES, LABS, GLOSSARY, appHref } from '../../../lib/learn';

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

function CourseCard({ c, p }: { c: (typeof COURSES)[number]; p: Palette }) {
  const router = useRouter();
  const live = c.status === 'live';
  const dest = c.external ? appHref(c.external.href) : `/more/learn-course/${c.slug}`;
  return (
    <Pressable
      onPress={live && dest ? () => router.push(dest) : undefined}
      style={[s.courseCell, !live && { opacity: 0.55 }]}
    >
      <Card style={{ flex: 1 }}>
        <Text style={[s.courseN, { color: p.accentText }]}>COURSE {c.n}</Text>
        <Text style={[s.courseTitle, { color: p.textPrimary }]}>{c.title}</Text>
        <Text style={[s.courseTag, { color: p.textMuted }]} numberOfLines={3}>
          {c.tagline}
        </Text>
        <Text style={[s.courseFoot, { color: p.accentText }]}>
          {c.status === 'soon' ? 'soon' : c.external ? 'its own portal →' : `${c.lessons.length} lessons →`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function LearnHubScreen() {
  const { p } = usePalette();
  const router = useRouter();
  const termCount = Object.keys(GLOSSARY).length;

  return (
    <SubScreen title="Learn">
      <View style={{ marginTop: 8, gap: 10 }}>
        <Text style={[s.intro, { color: p.textMuted }]}>
          How the market actually works — not which stocks to buy. Courses in plain English, every term
          tap-to-explain, and live experiments to watch the ideas play out.
        </Text>

        {/* the curriculum — two-wide grid */}
        <SectionTitle sub="eight courses, in order — start at the machine">The curriculum</SectionTitle>
        <View style={s.grid}>
          {COURSES.map((c) => (
            <CourseCard key={c.slug} c={c} p={p} />
          ))}
        </View>

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
});
