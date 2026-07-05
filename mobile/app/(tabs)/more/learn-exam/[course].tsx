import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SubScreen, Card, Footnote, Loading, ErrorNote } from '../../../../components/Chrome';
import { usePalette, F } from '../../../../constants/theme';
import { courseBySlug, parseNumericAnswer, unitHint } from '../../../../lib/learn';
import MdText from '../../../../components/MdText';
import { api } from '../../../../services/api';

/** The course exam (web /learn/[course]/exam parity, D111 L5). Questions arrive with
 * answer keys STRIPPED and order shuffled per sitting; grading happens server-side.
 * Unlimited retakes, best score stands, the attempt count is part of the record. */

type PublicQuestion = {
  id: string;
  prompt: string;
} & ({ kind: 'choice'; options: { id: string; md: string }[]; multi?: boolean } | { kind: 'numeric'; unit: 'cents' | 'shares' | 'pct' | 'bps' | 'years'; placeholder?: string });

type ExamPayload = { version: number; passPct: number; attempts: number; best: number | null; questions: PublicQuestion[] };
type ResultPayload = {
  scorePct: number;
  passed: boolean;
  passPct: number;
  attempts: number;
  best: number;
  results: { id: string; ok: boolean; expected: string; explain: string; reviewLesson?: string; reviewTitle?: string }[];
};

export default function LearnExamScreen() {
  const { course: courseSlug } = useLocalSearchParams<{ course: string }>();
  const { p } = usePalette();
  const router = useRouter();
  const course = courseBySlug(courseSlug ?? '');

  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);

  const load = useCallback(async () => {
    setExam(null);
    setResult(null);
    setAnswers({});
    setError(null);
    try {
      setExam(await api<ExamPayload>(`/api/learn/exam/${courseSlug}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the exam.');
    }
  }, [courseSlug]);

  useEffect(() => {
    if (courseSlug) void load();
  }, [courseSlug, load]);

  if (!course) {
    return (
      <SubScreen title="Exam">
        <ErrorNote message="That course doesn't exist." />
      </SubScreen>
    );
  }

  const answeredCount = exam
    ? exam.questions.filter((q) => {
        const a = answers[q.id];
        if (q.kind === 'numeric') return typeof a === 'string' && parseNumericAnswer(q.unit, a) !== null;
        return Array.isArray(a) ? a.length > 0 : typeof a === 'string' && a.length > 0;
      }).length
    : 0;

  const submit = async () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api<ResultPayload>(`/api/learn/exam/${courseSlug}`, { method: 'POST', body: JSON.stringify({ answers }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grading failed — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SubScreen title={`The exam · ${course.title}`}>
      <View style={{ marginTop: 8, gap: 12 }}>
        {!exam && !error && <Loading />}
        {error && !exam && <ErrorNote message={error} />}

        {exam && !result && (
          <>
            <Text style={[s.meta, { color: p.textMuted }]}>
              {exam.questions.length} questions · pass ≥ {exam.passPct}% · unlimited retakes — best score stands, attempts show
              {exam.attempts > 0 ? ` · you've sat it ${exam.attempts}× (best ${exam.best}%)` : ''}
            </Text>

            {exam.questions.map((q, qi) => (
              <Card key={q.id}>
                <MdText body={`**${qi + 1}.** ${q.prompt}`} foldAt={100000} />
                {q.kind === 'choice' ? (
                  <View style={{ gap: 6, marginTop: 8 }}>
                    {q.options.map((o) => {
                      const cur = answers[q.id];
                      const picked = Array.isArray(cur) ? cur.includes(o.id) : cur === o.id;
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() =>
                            setAnswers((a) => {
                              if (!q.multi) return { ...a, [q.id]: o.id };
                              const prevArr = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
                              return { ...a, [q.id]: picked ? prevArr.filter((x) => x !== o.id) : [...prevArr, o.id] };
                            })
                          }
                          style={[
                            s.option,
                            { borderColor: picked ? p.accent + '99' : p.cardBorder, backgroundColor: picked ? p.accent + '14' : 'transparent' },
                          ]}
                        >
                          <Text style={[s.optionText, { color: p.textPrimary }]}>{o.md.replace(/\*\*/g, '')}</Text>
                        </Pressable>
                      );
                    })}
                    {q.multi ? <Text style={[s.hint, { color: p.textMuted }]}>pick every answer that applies</Text> : null}
                  </View>
                ) : (
                  <View style={s.numRow}>
                    {q.unit === 'cents' ? <Text style={[s.unit, { color: p.textMuted }]}>$</Text> : null}
                    <TextInput
                      value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                      onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))}
                      keyboardType="decimal-pad"
                      placeholder={q.placeholder ?? ''}
                      placeholderTextColor={p.textMuted + '66'}
                      style={[s.input, { borderColor: p.cardBorder, color: p.textPrimary }]}
                    />
                    {q.unit !== 'cents' ? <Text style={[s.unit, { color: p.textMuted }]}>{unitHint(q.unit)}</Text> : null}
                  </View>
                )}
              </Card>
            ))}

            {error ? <ErrorNote message={error} /> : null}
            <View style={s.submitRow}>
              <Pressable
                disabled={answeredCount < exam.questions.length || submitting}
                onPress={() => void submit()}
                style={[s.btn, { backgroundColor: p.accent + '26', opacity: answeredCount < exam.questions.length || submitting ? 0.5 : 1 }]}
              >
                <Text style={[s.btnText, { color: p.accentText }]}>{submitting ? 'GRADING…' : 'SUBMIT EXAM'}</Text>
              </Pressable>
              <Text style={[s.meta, { color: p.textMuted }]}>
                {answeredCount}/{exam.questions.length} answered
              </Text>
            </View>
          </>
        )}

        {exam && result && (
          <>
            <Card>
              <View style={s.scoreRow}>
                <Text style={[s.score, { color: result.passed ? p.pos : p.warn }]}>{result.scorePct}%</Text>
                <Text style={[s.verdict, { color: result.passed ? p.pos : p.warn }]}>
                  {result.passed ? 'Passed' : `Below the bar (${result.passPct}%)`}
                </Text>
              </View>
              <Text style={[s.meta, { color: p.textMuted, marginTop: 4 }]}>
                attempt #{result.attempts} · best {result.best}% ·{' '}
                {result.passed ? 'best score stands, attempt count shows' : 'unlimited retakes — the questions reshuffle'}
              </Text>
            </Card>

            {result.results.map((r, ri) => {
              const q = exam.questions.find((x) => x.id === r.id);
              return (
                <Card key={r.id}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: r.ok ? p.pos : p.warn }}>{r.ok ? '✓' : '✗'} Question {ri + 1}</Text>
                  {q ? <MdText body={q.prompt} foldAt={100000} /> : null}
                  {!r.ok ? (
                    <Text style={[s.expected, { color: p.textPrimary }]}>
                      <Text style={{ color: p.textMuted }}>Answer: </Text>
                      {r.expected.replace(/\*\*/g, '')}
                    </Text>
                  ) : null}
                  <MdText body={r.explain} foldAt={100000} />
                  {!r.ok && r.reviewLesson ? (
                    <Pressable onPress={() => router.push(`/more/learn-lesson/${course.slug}/${r.reviewLesson}` as never)}>
                      <Text style={[s.review, { color: p.accentText }]}>review: {r.reviewTitle ?? r.reviewLesson} →</Text>
                    </Pressable>
                  ) : null}
                </Card>
              );
            })}

            <View style={s.submitRow}>
              <Pressable onPress={() => void load()} style={[s.btn, { backgroundColor: p.accent + '26' }]}>
                <Text style={[s.btnText, { color: p.accentText }]}>RETAKE THE EXAM</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/more/learn-course/${course.slug}` as never)} style={[s.btn, { borderWidth: 1, borderColor: p.cardBorder }]}>
                <Text style={[s.btnText, { color: p.textMuted }]}>BACK TO COURSE</Text>
              </Pressable>
            </View>
          </>
        )}

        <Footnote>graded server-side — the answer keys never leave the fund&apos;s own backend</Footnote>
      </View>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  meta: { fontFamily: F.reg, fontSize: 10.5, lineHeight: 15 },
  option: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  optionText: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16 },
  hint: { fontFamily: F.reg, fontSize: 9.5 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  unit: { fontFamily: F.semi, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 110, fontFamily: F.med, fontSize: 13 },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  btnText: { fontFamily: F.semi, fontSize: 12.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  score: { fontFamily: F.black, fontSize: 30 },
  verdict: { fontFamily: F.semi, fontSize: 13 },
  expected: { fontFamily: F.semi, fontSize: 11.5, marginTop: 6 },
  review: { fontFamily: F.semi, fontSize: 11.5, marginTop: 6 },
});
