/**
 * DailyPuzzle.jsx
 *
 * Clean puzzle UI. No internal metadata exposed to the user.
 *
 * What is shown:    sequence numbers / matrix grid, input field, submit,
 *                   score on solve, hint panel (budget-controlled).
 * What is hidden:   difficulty, type, patternKey, hint string, performanceScore,
 *                   puzzleSeed — all remain internal for the analytics engine.
 *
 * State machine:
 *   loading     → generating puzzle + checking Dexie + loading hint state
 *   idle        → ready to play
 *   inProgress  → timer running
 *   solved      → locked; shows result banner
 *   error       → load failure with retry
 */

import { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import { auth } from "../firebase";
import {
  saveDailyActivity,
  getActivityByDate,
  incrementAttempts,
} from "../db";
import { generateDailyPuzzle, updateUserStats } from "../utils/puzzlegenerator";
import { syncActivityToFirestore }               from "../utils/firestoresync";
import { computeHintBudget, getHintText, useHint, getHintsUsedToday } from "../utils/Hintengine";
import { bustAnalyticsCache }                    from "../utils/Advancedanalytics";
import HintPanel                                  from "./Hintpanel";
import { BS, font, radius, shadow }               from "../constants/Brand";

/* ─── Status enum ────────────────────────────────────────────────────────── */
const STATUS = {
  LOADING:     "loading",
  IDLE:        "idle",
  IN_PROGRESS: "inProgress",
  SOLVED:      "solved",
  ERROR:       "error",
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function DailyPuzzle({ onComplete }) {
  const [puzzle,     setPuzzle]     = useState(null);
  const [userGrid,   setUserGrid]   = useState([]);
  const [input,      setInput]      = useState("");
  const [startTime,  setStartTime]  = useState(null);
  const [status,     setStatus]     = useState(STATUS.LOADING);
  const [solvedNow,  setSolvedNow]  = useState(false);
  const [errorMsg,   setErrorMsg]   = useState("");
  const [attempts,   setAttempts]   = useState(0);
  const [finalScore, setFinalScore] = useState(null);
  const [finalTime,  setFinalTime]  = useState(null);

  const [hintBudget, setHintBudget] = useState(0);
  const [hintsUsed,  setHintsUsed]  = useState(0);
  const [hintText,   setHintText]   = useState(null);

  useEffect(() => { loadPuzzle(); }, []);

  /* ── Load & restore ──────────────────────────────────────────────────── */
  const loadPuzzle = useCallback(async () => {
    setStatus(STATUS.LOADING);
    setErrorMsg("");
    setAttempts(0);
    setFinalScore(null);
    setFinalTime(null);
    setSolvedNow(false);
    setHintText(null);
    setHintsUsed(0);
    setHintBudget(0);

    try {
      const p     = await generateDailyPuzzle();
      const today = dayjs().format("YYYY-MM-DD");
      if (p.date !== today) p.date = today;
      setPuzzle(p);

      const existing = await getActivityByDate(today);

      if (existing && existing.date === today && existing.solved === true) {
        setFinalScore(existing.score);
        setFinalTime(existing.timeTaken);
        setAttempts(existing.attempts ?? 1);
        setSolvedNow(false);
        setStatus(STATUS.SOLVED);
        return;
      }

      if (existing && existing.date === today) {
        setAttempts(existing.attempts ?? 0);
      }

      if (p.type === "matrix") {
        setUserGrid(p.grid.map((cell) => (cell === null ? "" : String(cell))));
      }

      const [budget, usedToday] = await Promise.all([
        computeHintBudget(p.difficulty),
        getHintsUsedToday(today),
      ]);
      setHintBudget(budget);
      setHintsUsed(usedToday);
      setStatus(STATUS.IDLE);
    } catch (err) {
      console.error("[DailyPuzzle] Load failed:", err);
      setStatus(STATUS.ERROR);
      setErrorMsg("Could not load today's puzzle. Please refresh.");
    }
  }, []);

  /* ── Timer ───────────────────────────────────────────────────────────── */
  const handleStart = useCallback(() => {
    if (!startTime) {
      setStartTime(Date.now());
      setStatus(STATUS.IN_PROGRESS);
    }
  }, [startTime]);

  /* ── Grid cell update ────────────────────────────────────────────────── */
  const handleGridChange = useCallback((index, value) => {
    setUserGrid((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  /* ── Hint request ────────────────────────────────────────────────────── */
  const handleUseHint = useCallback(async ({ level }) => {
    if (!puzzle || hintsUsed >= hintBudget) return;

    const userAnswer = puzzle.type === "sequence"
      ? (input !== "" ? parseInt(input, 10) : null)
      : null;

    const correctCount = puzzle.type === "matrix"
      ? userGrid.filter((val, i) =>
          puzzle.grid[i] === null && parseInt(val, 10) === puzzle.solution[i]
        ).length
      : 0;

    const blankCount = puzzle.type === "matrix"
      ? puzzle.grid.filter((c) => c === null).length
      : 0;

    const text = getHintText({
      level,
      puzzleType: puzzle.type,
      patternKey: puzzle.patternKey,
      userAnswer,
      answer:     puzzle.answer,
      correctCount,
      blankCount,
    });

    setHintText(text);
    setHintsUsed(hintsUsed + 1);
    await useHint(puzzle.date, puzzle.difficulty, hintBudget);
    bustAnalyticsCache();

    if (!startTime) {
      setStartTime(Date.now());
      setStatus(STATUS.IN_PROGRESS);
    }
  }, [puzzle, hintsUsed, hintBudget, input, userGrid, startTime]);

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!puzzle || status === STATUS.SOLVED || status === STATUS.LOADING) return;

    let isCorrect = false;
    if (puzzle.type === "sequence") {
      isCorrect = parseInt(input, 10) === puzzle.answer;
    } else if (puzzle.type === "matrix") {
      isCorrect = userGrid.every(
        (val, i) => parseInt(val, 10) === puzzle.solution[i]
      );
    }

    if (!isCorrect) {
      setAttempts((a) => a + 1);
      await incrementAttempts(puzzle.date);
      updateUserStats(false, 0);
      setErrorMsg("Not quite — try again!");
      return;
    }

    // Correct ─────────────────────────────────────────────────────────────
    setErrorMsg("");
    const timeTaken     = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const score         = Math.max(100 - timeTaken, 10);
    const totalAttempts = attempts + 1;
    const user          = auth.currentUser;

    updateUserStats(true, timeTaken);
    setFinalScore(score);
    setFinalTime(timeTaken);
    setSolvedNow(true);
    setStatus(STATUS.SOLVED);

    const activity = {
      date:       puzzle.date,
      uid:        user?.uid ?? "",
      score,
      timeTaken,
      difficulty: puzzle.difficulty,
      solved:     true,
      attempts:   totalAttempts,
      puzzleSeed: puzzle.date,
      synced:     0,
      createdAt:  Date.now(),
    };

    const saved = await saveDailyActivity(activity);
    bustAnalyticsCache();

    if (user && navigator.onLine) {
      try {
        await syncActivityToFirestore(user.uid, { ...saved, uid: user.uid });
        await saveDailyActivity({ ...saved, synced: 1 });
      } catch (err) {
        console.warn("[DailyPuzzle] Sync deferred:", err.message);
      }
    }

    onComplete?.({ date: puzzle.date, score, timeTaken, solved: true });
  }, [puzzle, input, userGrid, startTime, status, attempts, onComplete]);

  /* ── Render: loading ─────────────────────────────────────────────────── */
  if (status === STATUS.LOADING) {
    return (
      <div style={{
        background:  BS.card,
        border:      `1px solid ${BS.border}`,
        borderRadius: radius.xl,
        boxShadow:   shadow.card,
        padding:     "32px 24px",
        textAlign:   "center",
        width:       "100%",
        maxWidth:    "440px",
        fontFamily:  font.base,
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          {/* Pulsing logo mark */}
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%",
            background: BS.primaryLight,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "pulse 1.5s ease-in-out infinite",
          }}>
            <span style={{ fontSize: "18px" }}>🧩</span>
          </div>
          <p style={{ color: BS.textSubtle, fontSize: "13px", margin: 0 }}>
            Loading today's puzzle…
          </p>
        </div>
      </div>
    );
  }

  /* ── Render: error ───────────────────────────────────────────────────── */
  if (status === STATUS.ERROR) {
    return (
      <div style={{
        background:   BS.card,
        border:       `1px solid ${BS.errorBorder}`,
        borderRadius: radius.xl,
        boxShadow:    shadow.card,
        padding:      "32px 24px",
        textAlign:    "center",
        width:        "100%",
        maxWidth:     "440px",
        fontFamily:   font.base,
      }}>
        <p style={{ color: BS.error, fontSize: "13px", marginBottom: "16px" }}>{errorMsg}</p>
        <button
          onClick={loadPuzzle}
          style={{
            background:   BS.primary,
            color:        "#fff",
            border:       "none",
            borderRadius: radius.md,
            padding:      "8px 20px",
            fontSize:     "13px",
            fontFamily:   font.base,
            fontWeight:   600,
            cursor:       "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const isLocked = status === STATUS.SOLVED;

  /* ── Render: puzzle card ─────────────────────────────────────────────── */
  return (
    <div style={{
      background:   BS.card,
      border:       `1px solid ${BS.border}`,
      borderRadius: radius.xl,
      boxShadow:    shadow.card,
      padding:      "28px 24px",
      width:        "100%",
      maxWidth:     "440px",
      fontFamily:   font.base,
    }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <h2 style={{
          fontSize: "18px", fontWeight: 700,
          color: BS.primary, margin: "0 0 4px",
          fontFamily: font.base,
        }}>
          Daily Puzzle
        </h2>
        <p style={{ fontSize: "11px", color: BS.textSubtle, margin: 0, letterSpacing: "0.04em" }}>
          {puzzle?.date}
        </p>
        {/* Thin accent bar under date */}
        <div style={{
          height: "2px", width: "32px",
          background: `linear-gradient(90deg, ${BS.primary}, ${BS.violet})`,
          borderRadius: "2px",
          margin: "8px auto 0",
        }} />
      </div>

      {/* ── Sequence puzzle ─────────────────────────────────────────── */}
      {puzzle?.type === "sequence" && (
        <div style={{ marginBottom: "4px" }}>
          <p style={{ textAlign: "center", fontSize: "12px", color: BS.textSubtle, marginBottom: "16px" }}>
            What comes next?
          </p>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "8px", flexWrap: "wrap", marginBottom: "4px",
          }}>
            {puzzle.sequence.map((n, i) => (
              <span key={i} style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                width:          "48px", height: "48px",
                background:     BS.primaryLight,
                border:         `1.5px solid ${BS.border}`,
                borderRadius:   radius.md,
                fontSize:       "15px",
                fontFamily:     font.mono,
                fontWeight:     600,
                color:          BS.primary,
              }}>
                {n}
              </span>
            ))}

            <span style={{ color: BS.textSubtle, fontFamily: font.mono, fontSize: "18px", lineHeight: 1 }}>
              ,
            </span>

            {isLocked ? (
              <span style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                width:          "48px", height: "48px",
                background:     BS.successLight,
                border:         `1.5px solid ${BS.success}`,
                borderRadius:   radius.md,
                fontSize:       "15px",
                fontFamily:     font.mono,
                fontWeight:     700,
                color:          BS.solveText,
              }}>
                {puzzle.answer}
              </span>
            ) : (
              <input
                type="number"
                value={input}
                onChange={(e) => { setInput(e.target.value); setErrorMsg(""); }}
                onFocus={handleStart}
                placeholder="?"
                style={{
                  width:       "48px", height: "48px",
                  textAlign:   "center",
                  border:      `2px solid ${BS.primary}`,
                  borderRadius: radius.md,
                  fontSize:    "15px",
                  fontFamily:  font.mono,
                  fontWeight:  700,
                  color:       BS.primary,
                  background:  BS.card,
                  outline:     "none",
                  WebkitAppearance: "none",
                  MozAppearance: "textfield",
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Matrix puzzle ────────────────────────────────────────────── */}
      {puzzle?.type === "matrix" && (
        <div style={{ marginBottom: "4px" }}>
          <p style={{ textAlign: "center", fontSize: "12px", color: BS.textSubtle, marginBottom: "16px" }}>
            Fill in the missing values:
          </p>
          <div style={{
            display:    "grid",
            gridTemplateColumns: "repeat(4, 44px)",
            gap:        "6px",
            justifyContent: "center",
          }}>
            {userGrid.map((cell, i) => {
              const isGiven = puzzle.grid[i] !== null;
              return (
                <input
                  key={i}
                  type="number"
                  value={cell}
                  disabled={isGiven || isLocked}
                  onChange={(e) => { handleGridChange(i, e.target.value); setErrorMsg(""); }}
                  onFocus={handleStart}
                  style={{
                    width:       "44px", height: "44px",
                    textAlign:   "center",
                    borderRadius: radius.sm,
                    fontSize:    "13px",
                    fontFamily:  font.mono,
                    fontWeight:  600,
                    border:      isGiven
                      ? `1.5px solid ${BS.border}`
                      : isLocked
                        ? `1.5px solid ${BS.success}`
                        : `1.5px solid ${BS.primary}44`,
                    background:  isGiven
                      ? BS.primaryLight
                      : isLocked
                        ? BS.successLight
                        : BS.card,
                    color: isGiven ? BS.primary : isLocked ? BS.solveText : BS.text,
                    cursor: (isGiven || isLocked) ? "not-allowed" : "text",
                    outline: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "textfield",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Attempt counter ──────────────────────────────────────────── */}
      {attempts > 0 && !isLocked && (
        <p style={{
          textAlign: "center", fontSize: "11px",
          color: BS.accent, margin: "10px 0 0",
        }}>
          {attempts} {attempts === 1 ? "attempt" : "attempts"} so far
        </p>
      )}

      {/* ── Error feedback ───────────────────────────────────────────── */}
      {errorMsg && !isLocked && (
        <div style={{
          background:   BS.errorLight,
          border:       `1px solid ${BS.errorBorder}`,
          borderRadius: radius.md,
          padding:      "8px 12px",
          marginTop:    "10px",
          textAlign:    "center",
        }}>
          <p style={{ fontSize: "12px", color: BS.error, margin: 0 }}>{errorMsg}</p>
        </div>
      )}

      {/* ── Divider ──────────────────────────────────────────────────── */}
      {!isLocked && (
        <div style={{
          height: "1px", background: BS.border,
          margin: "18px 0",
        }} />
      )}

      {/* ── Submit ───────────────────────────────────────────────────── */}
      {!isLocked && (
        <button
          onClick={handleSubmit}
          style={{
            display:      "block",
            width:        "100%",
            padding:      "11px",
            background:   `linear-gradient(135deg, ${BS.primary}, ${BS.violet})`,
            color:        "#fff",
            border:       "none",
            borderRadius: radius.md,
            fontSize:     "14px",
            fontWeight:   600,
            fontFamily:   font.base,
            cursor:       "pointer",
            letterSpacing: "0.02em",
            transition:   "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Submit Answer
        </button>
      )}

      {/* ── Hint panel ───────────────────────────────────────────────── */}
      {!isLocked && (
        <div style={{ marginTop: "12px" }}>
          <HintPanel
            date={puzzle?.date}
            difficulty={puzzle?.difficulty}
            budget={hintBudget}
            hintsUsed={hintsUsed}
            onUseHint={handleUseHint}
            hintText={hintText}
            puzzleStatus={status}
          />
        </div>
      )}

      {/* ── Result banner ────────────────────────────────────────────── */}
      {isLocked && (
        <div style={{ marginTop: "20px" }}>
          {solvedNow ? (
            /* Fresh solve celebration */
            <div style={{
              background:   BS.solveGrad,
              border:       `1px solid ${BS.solveBorder}`,
              borderRadius: radius.lg,
              padding:      "20px 16px",
              textAlign:    "center",
            }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎉</div>
              <p style={{
                fontSize: "14px", fontWeight: 700,
                color: BS.solveText, margin: "0 0 16px",
              }}>
                Solved!
              </p>

              {/* Stat grid */}
              <div style={{
                display: "flex", justifyContent: "center", gap: "24px",
              }}>
                {[
                  { value: finalScore, label: "Score" },
                  { value: `${finalTime}s`, label: "Time" },
                  { value: attempts, label: attempts === 1 ? "Attempt" : "Attempts" },
                  ...(hintsUsed > 0
                    ? [{ value: hintsUsed, label: hintsUsed === 1 ? "Hint" : "Hints" }]
                    : []),
                ].map(({ value, label }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "22px", fontWeight: 800, color: BS.solveText, lineHeight: 1 }}>
                      {value}
                    </span>
                    <span style={{ fontSize: "10px", color: BS.solveSubtext, letterSpacing: "0.04em" }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Already solved today */
            <div style={{
              background:   BS.primaryLight,
              border:       `1px solid ${BS.border}`,
              borderRadius: radius.lg,
              padding:      "18px 16px",
              textAlign:    "center",
            }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: BS.primary, margin: "0 0 6px" }}>
                ✅ Already solved today!
              </p>
              <p style={{ fontSize: "11px", color: BS.textMuted, margin: "0 0 8px" }}>
                Score: <strong>{finalScore}</strong> · Time: <strong>{finalTime}s</strong> · Attempts: <strong>{attempts}</strong>
              </p>
              <p style={{ fontSize: "11px", color: BS.violet, margin: 0 }}>
                Come back tomorrow for a new challenge 🧩
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}