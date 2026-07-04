import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette, F, type Palette } from '../../constants/theme';
import { type LearnQuestion, parseNumericAnswer, numericCorrect, choiceCorrect, unitHint } from '../../lib/learn';
import MdText from '../MdText';

/** An inline lesson check (D111 §7.2, web CheckBlock parity) — FORMATIVE: graded right
 * here, instant feedback + the teach-back, never scored. Fires onAnswered(qid) on the
 * first answer (right or wrong) so the lesson can count engagement toward completion. */

function Explain({ ok, text, p }: { ok: boolean; text: string; p: Palette }) {
  return (
    <View style={[s.explain, { borderColor: ok ? p.pos + '55' : p.warn + '55', backgroundColor: (ok ? p.pos : p.warn) + '11' }]}>
      <Text style={{ fontFamily: F.bold, fontSize: 11.5, color: ok ? p.pos : p.warn }}>{ok ? 'Right.' : 'Not quite.'}</Text>
      <MdText body={text} foldAt={100000} />
    </View>
  );
}

export default function LearnCheck({ q, onAnswered }: { q: LearnQuestion; onAnswered?: (qid: string) => void }) {
  const { p } = usePalette();
  const [answered, setAnswered] = useState(false);
  const [ok, setOk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [numRaw, setNumRaw] = useState('');

  const finish = (correct: boolean) => {
    if (!answered) onAnswered?.(q.id);
    setAnswered(true);
    setOk(correct);
  };
  const reset = () => {
    setAnswered(false);
    setOk(false);
    setPicked([]);
    setNumRaw('');
  };

  return (
    <View style={[s.box, { borderColor: p.cardBorder, backgroundColor: p.cardHi + '33' }]}>
      <MdText body={q.prompt} foldAt={100000} />
      {q.kind === 'choice' ? (
        <View style={{ gap: 6, marginTop: 8 }}>
          {q.options.map((o) => {
            const isPicked = picked.includes(o.id);
            const isCorrect = q.correct.includes(o.id);
            let border = p.cardBorder;
            let bg = 'transparent';
            if (answered) {
              if (isCorrect) {
                border = p.pos + '88';
                bg = p.pos + '14';
              } else if (isPicked) {
                border = p.warn + '88';
                bg = p.warn + '14';
              }
            } else if (isPicked) {
              border = p.accent + '99';
              bg = p.accent + '14';
            }
            return (
              <Pressable
                key={o.id}
                disabled={answered}
                onPress={() => {
                  if (!q.multi) {
                    setPicked([o.id]);
                    finish(choiceCorrect(q, [o.id]));
                  } else {
                    setPicked((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]));
                  }
                }}
                style={[s.option, { borderColor: border, backgroundColor: bg, opacity: answered && !isCorrect && !isPicked ? 0.55 : 1 }]}
              >
                <Text style={[s.optionText, { color: p.textPrimary }]}>{o.md.replace(/\*\*/g, '')}</Text>
              </Pressable>
            );
          })}
          {q.multi && !answered ? (
            <Pressable
              disabled={picked.length === 0}
              onPress={() => finish(choiceCorrect(q, picked))}
              style={[s.btn, { backgroundColor: p.accent + '26', opacity: picked.length ? 1 : 0.5 }]}
            >
              <Text style={[s.btnText, { color: p.accentText }]}>Check</Text>
            </Pressable>
          ) : null}
          {q.multi && !answered ? <Text style={[s.hint, { color: p.textMuted }]}>pick every answer that applies</Text> : null}
        </View>
      ) : (
        <View style={s.numRow}>
          {q.unit === 'cents' ? <Text style={[s.unit, { color: p.textMuted }]}>$</Text> : null}
          <TextInput
            value={numRaw}
            editable={!answered}
            onChangeText={setNumRaw}
            keyboardType="decimal-pad"
            placeholder={q.placeholder ?? ''}
            placeholderTextColor={p.textMuted + '66'}
            style={[s.input, { borderColor: p.cardBorder, color: p.textPrimary }]}
          />
          {q.unit !== 'cents' ? <Text style={[s.unit, { color: p.textMuted }]}>{unitHint(q.unit)}</Text> : null}
          {!answered ? (
            <Pressable
              disabled={parseNumericAnswer(q.unit, numRaw) === null}
              onPress={() => finish(numericCorrect(q, numRaw))}
              style={[s.btn, { backgroundColor: p.accent + '26', opacity: parseNumericAnswer(q.unit, numRaw) === null ? 0.5 : 1 }]}
            >
              <Text style={[s.btnText, { color: p.accentText }]}>Check</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {answered ? (
        <>
          <Explain ok={ok} text={q.explain} p={p} />
          <Pressable onPress={reset}>
            <Text style={[s.again, { color: p.textMuted }]}>try it again</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12 },
  option: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  optionText: { fontFamily: F.reg, fontSize: 11.5, lineHeight: 16 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  unit: { fontFamily: F.semi, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 110, fontFamily: F.med, fontSize: 13 },
  btn: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7 },
  btnText: { fontFamily: F.semi, fontSize: 12 },
  hint: { fontFamily: F.reg, fontSize: 9.5 },
  explain: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10, gap: 4 },
  again: { fontFamily: F.reg, fontSize: 10.5, marginTop: 8, textDecorationLine: 'underline' },
});
