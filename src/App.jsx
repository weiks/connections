import { useState, useCallback, useEffect, useRef } from "react";

// CHANGE THIS to your Cloudflare Worker URL after deploying
const API_URL = "https://connections-proxy.michael-weiksner.workers.dev/";

const ALL_TOPICS = [
  "finance & investing (Wall Street, markets, trading, portfolio management, Bloomberg jargon)",
  "Washington DC (politics, government, Beltway culture, monuments, agencies, Congressional procedure)",
  "Harvard Business School (MBA culture, case method, strategy frameworks, famous alumni, recruiting)",
  "English Premier League & world soccer (EPL clubs, players past & present, tactics, transfers, football culture)",
  "sports betting (odds, parlays, spreads, sharps, props, line movement, sportsbook culture)",
  "boating & fishing (nautical terms, tackle, fish species, boat types, knots, maritime lingo)",
  "1980s and 1990s trivia (pop culture, movies, music, TV shows, toys, fashion, tech of the era)",
  "foreign affairs (diplomacy, international orgs, geopolitics, treaties, doctrines, world leaders)",
  "current events & politics 2024-2025 (recent headlines, elections, policy debates, figures in the news)",
];

function buildSystemPrompt() {
  const shuffled = [...ALL_TOPICS].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 4);

  return `You are a devious puzzle designer for a word game called "Connections" (like the NYT game).

Each of the 4 groups draws from a DIFFERENT topic domain. The 4 topics for this puzzle are:
1. ${picked[0]}
2. ${picked[1]}
3. ${picked[2]}
4. ${picked[3]}

Create 4 groups of 4 words each. Each group shares a hidden connection drawn from its assigned topic.

CROSS-OVER POTENTIAL — THIS IS THE MOST IMPORTANT RULE:
You MUST choose words that have strong cross-over potential across multiple topic domains. Every word should plausibly fit in at least 2 groups. This is what makes the puzzle great.

Examples of ideal cross-over words:
- "PITCH" could be soccer (pitch = field), finance (pitch deck), boating (pitch of a hull), betting (sales pitch)
- "ARSENAL" could be soccer (club), DC (military), foreign affairs (weapons)
- "SPREAD" could be betting (point spread), finance (bid-ask spread), fishing (spread bait)
- "COVER" could be betting (cover the spread), finance (short cover), 80s/90s (cover band)
- "HEDGE" could be finance (hedge fund), boating (hedge a bet), foreign affairs (hedge strategy)

Aim for AT LEAST 8 of the 16 words to have plausible cross-over appeal. The player should constantly second-guess which group a word belongs to.

DIFFICULTY MIX:
- Include a mix of easy, medium, and hard categories
- At least one category should be accessible (obvious once you see it)
- At least one should be very tricky (wordplay, hidden patterns, or obscure connections)
- The hardest category (difficulty 4) should be especially clever and surprising but fair

RULES:
- Words should be 1-2 words max, ALL CAPS
- Categories should be clever: use wordplay, puns, double meanings, "___ X" patterns, hidden structural patterns, or surprisingly specific groupings
- The category NAME should be specific and descriptive (not vague)
- All 16 words must be unique
- Do NOT make categories that are just "things related to [topic]" — be more specific and clever

Respond with ONLY valid JSON in this exact format, no other text:
{
  "categories": [
    {"name": "Category Name", "difficulty": 1, "words": ["WORD1", "WORD2", "WORD3", "WORD4"]},
    {"name": "Category Name", "difficulty": 2, "words": ["WORD1", "WORD2", "WORD3", "WORD4"]},
    {"name": "Category Name", "difficulty": 3, "words": ["WORD1", "WORD2", "WORD3", "WORD4"]},
    {"name": "Category Name", "difficulty": 4, "words": ["WORD1", "WORD2", "WORD3", "WORD4"]}
  ]
}

difficulty 1 = easiest (yellow), 2 = medium (green), 3 = hard (blue), 4 = hardest (purple)`;
}

const DIFFICULTY_COLORS = {
  1: { bg: "#F9DF6D", text: "#1a1a1a", label: "Easy" },
  2: { bg: "#A0C35A", text: "#1a1a1a", label: "Medium" },
  3: { bg: "#B0C4EF", text: "#1a1a1a", label: "Hard" },
  4: { bg: "#BA81C5", text: "#1a1a1a", label: "Tricky" },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function judgeAnswer(userGuess, actualName, words) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: `You judge whether a player's guess matches the intended category in a Connections word game. Be GENEROUS — accept answers that capture the same core idea even if worded differently. Synonyms, rephrasings, and partial matches that show understanding should be accepted.

Respond with ONLY valid JSON: {"match": true/false, "explanation": "brief reason"}`,
        messages: [
          {
            role: "user",
            content: `The 4 words are: ${words.join(", ")}
The intended category name is: "${actualName}"
The player guessed: "${userGuess}"

Does the player's guess capture the same connection? Be generous — if they clearly understand the grouping, accept it.`,
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { match: false, explanation: "Could not verify — giving benefit of the doubt." };
  }
}

function LoadingSpinner() {
  return (
    <div style={styles.loadingContainer}>
      <div style={styles.spinnerWrapper}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...styles.loadingTile, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <p style={styles.loadingText}>Generating puzzle...</p>
      <p style={styles.loadingSubtext}>Mixing topics and crafting tricky connections</p>
    </div>
  );
}

export default function Connections() {
  const [categories, setCategories] = useState(null);
  const [words, setWords] = useState([]);
  const [selected, setSelected] = useState([]);
  const [solved, setSolved] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [shakeIds, setShakeIds] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [oneAway, setOneAway] = useState(false);
  const maxMistakes = 4;
  const generationCount = useRef(0);

  // Final group guessing state
  const [pendingFinalGroup, setPendingFinalGroup] = useState(null);
  const [guessInput, setGuessInput] = useState("");
  const [judging, setJudging] = useState(false);
  const [guessResult, setGuessResult] = useState(null);
  const [guessAttempts, setGuessAttempts] = useState(0);
  const maxGuessAttempts = 3;
  const inputRef = useRef(null);

  const generatePuzzle = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCategories(null);
    setWords([]);
    setSelected([]);
    setSolved([]);
    setMistakes(0);
    setShakeIds([]);
    setGameOver(false);
    setWon(false);
    setOneAway(false);
    setPendingFinalGroup(null);
    setGuessInput("");
    setJudging(false);
    setGuessResult(null);
    setGuessAttempts(0);
    generationCount.current += 1;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content: `Generate Connections puzzle #${generationCount.current}. Remember: each group from a different topic, mixed difficulty, clever red herrings across domains. The hardest category should have a connection that's surprising but nameable. Surprise me!`,
            },
          ],
        }),
      });

      const data = await response.json();
      const text = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      if (
        !parsed.categories ||
        parsed.categories.length !== 4 ||
        !parsed.categories.every((c) => c.words && c.words.length === 4 && c.name && c.difficulty)
      ) {
        throw new Error("Invalid puzzle format");
      }

      const allWords = parsed.categories.flatMap((c) => c.words);
      if (new Set(allWords.map((w) => w.toUpperCase())).size !== 16) {
        throw new Error("Duplicate words detected");
      }

      const cats = parsed.categories
        .sort((a, b) => a.difficulty - b.difficulty)
        .map((c) => ({
          name: c.name,
          color: DIFFICULTY_COLORS[c.difficulty]?.bg || "#ccc",
          textColor: DIFFICULTY_COLORS[c.difficulty]?.text || "#1a1a1a",
          words: c.words.map((w) => w.toUpperCase()),
          difficulty: c.difficulty,
        }));

      setCategories(cats);
      setWords(shuffle(allWords.map((w) => w.toUpperCase())));
    } catch (err) {
      console.error(err);
      setError("Failed to generate puzzle. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generatePuzzle();
  }, []);

  const solvedWords = solved.flatMap((s) => s.words);
  const remainingWords = words.filter((w) => !solvedWords.includes(w));

  const isLastGroup = categories && solved.length === categories.length - 1 && !gameOver;

  const toggleSelect = useCallback(
    (word) => {
      if (gameOver || !categories || pendingFinalGroup) return;
      if (solvedWords.includes(word)) return;
      setOneAway(false);
      setSelected((prev) => {
        if (prev.includes(word)) return prev.filter((w) => w !== word);
        if (prev.length < 4) return [...prev, word];
        return prev;
      });
    },
    [solvedWords, gameOver, categories, pendingFinalGroup]
  );

  const handleSubmit = useCallback(() => {
    if (selected.length !== 4 || gameOver || !categories || pendingFinalGroup) return;

    const match = categories.find(
      (cat) =>
        !solved.includes(cat) &&
        cat.words.every((w) => selected.includes(w)) &&
        selected.every((w) => cat.words.includes(w))
    );

    if (match) {
      // If this is the last group, don't auto-solve — require naming
      const wouldBeLastSolve = solved.length + 1 === categories.length;
      if (wouldBeLastSolve || (solved.length === 2 && isLastGroup)) {
        // Actually check: after solving this, is there exactly one group left?
        const remaining = categories.filter((c) => !solved.includes(c) && c !== match);
        if (remaining.length === 1) {
          // Solve this match, then trigger naming for the last one
          setSolved((prev) => [...prev, match]);
          setSelected([]);
          setOneAway(false);
          setPendingFinalGroup(remaining[0]);
          setTimeout(() => inputRef.current?.focus(), 300);
          return;
        }
      }

      setSolved((prev) => [...prev, match]);
      setSelected([]);
      setOneAway(false);
      if (solved.length + 1 === categories.length) {
        setWon(true);
        setGameOver(true);
      }
    } else {
      const isOneAway = categories.some(
        (cat) =>
          !solved.includes(cat) &&
          cat.words.filter((w) => selected.includes(w)).length === 3
      );
      setOneAway(isOneAway);

      const newMistakes = mistakes + 1;
      setMistakes(newMistakes);
      setShakeIds([...selected]);
      setTimeout(() => setShakeIds([]), 500);

      if (newMistakes >= maxMistakes) {
        setGameOver(true);
        setSelected([]);
        setOneAway(false);
        setTimeout(() => setSolved([...categories]), 600);
      } else {
        setSelected([]);
      }
    }
  }, [selected, solved, mistakes, gameOver, categories, pendingFinalGroup, isLastGroup]);

  useEffect(() => {
    if (selected.length === 4 && !gameOver && categories && !pendingFinalGroup) {
      const timer = setTimeout(() => handleSubmit(), 350);
      return () => clearTimeout(timer);
    }
  }, [selected, gameOver, categories, handleSubmit, pendingFinalGroup]);

  const handleGuessSubmit = useCallback(async () => {
    if (!pendingFinalGroup || !guessInput.trim() || judging) return;
    setJudging(true);
    setGuessResult(null);

    const result = await judgeAnswer(guessInput.trim(), pendingFinalGroup.name, pendingFinalGroup.words);

    if (result.match) {
      setGuessResult({ correct: true, explanation: result.explanation });
      setTimeout(() => {
        setSolved((prev) => [...prev, pendingFinalGroup]);
        setWon(true);
        setGameOver(true);
        setPendingFinalGroup(null);
      }, 1500);
    } else {
      const newAttempts = guessAttempts + 1;
      setGuessAttempts(newAttempts);
      if (newAttempts >= maxGuessAttempts) {
        setGuessResult({
          correct: false,
          explanation: `The connection was: "${pendingFinalGroup.name}"`,
          final: true,
        });
        setTimeout(() => {
          setSolved((prev) => [...prev, pendingFinalGroup]);
          setGameOver(true);
          setPendingFinalGroup(null);
        }, 2500);
      } else {
        setGuessResult({
          correct: false,
          explanation: result.explanation || "Not quite!",
          attemptsLeft: maxGuessAttempts - newAttempts,
        });
        setGuessInput("");
      }
    }
    setJudging(false);
  }, [pendingFinalGroup, guessInput, judging, guessAttempts]);

  const handleShuffle = () => setWords(shuffle(words));
  const handleDeselectAll = () => {
    setSelected([]);
    setOneAway(false);
  };

  const mistakeDots = Array.from({ length: maxMistakes }, (_, i) => i < maxMistakes - mistakes);

  if (loading) {
    return (
      <div style={styles.outer}>
        <style>{animationCSS}</style>
        <div style={styles.container}>
          <h1 style={styles.title}>Connections</h1>
          <div style={styles.badgeRow}>
            <div style={styles.badge}>MULTI-TOPIC MIX</div>
          </div>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.outer}>
        <style>{animationCSS}</style>
        <div style={styles.container}>
          <h1 style={styles.title}>Connections</h1>
          <div style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
            <button onClick={generatePuzzle} style={styles.btnPrimary}>Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.outer}>
      <style>{animationCSS}</style>
      <div style={styles.container}>
        <h1 style={styles.title}>Connections</h1>
        <div style={styles.badgeRow}>
          <div style={styles.badge}>MULTI-TOPIC MIX</div>
        </div>
        <p style={styles.subtitle}>Group four words that share a common thread.</p>


        <div style={styles.board}>
          {solved.map((cat, i) => (
            <div
              key={cat.name}
              style={{
                ...styles.solvedRow,
                backgroundColor: cat.color,
                color: cat.textColor,
                animation: "popIn 0.4s ease-out forwards",
                animationDelay: `${i * 0.05}s`,
              }}
            >
              <div style={styles.solvedName}>{cat.name}</div>
              <div style={styles.solvedWords}>{cat.words.join(", ")}</div>
            </div>
          ))}

          {/* Final group naming challenge */}
          {pendingFinalGroup && (
            <div style={{ animation: "fadeUp 0.4s ease-out" }}>
              <div style={styles.finalGroupBox}>
                <div style={styles.finalGroupWords}>
                  {pendingFinalGroup.words.map((w) => (
                    <span key={w} style={styles.finalWord}>{w}</span>
                  ))}
                </div>
                <p style={styles.finalPrompt}>
                  What connects these four words?
                </p>
                <div style={styles.guessRow}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGuessSubmit()}
                    placeholder="Type the connection..."
                    style={styles.guessInput}
                    disabled={judging || guessResult?.final}
                  />
                  <button
                    onClick={handleGuessSubmit}
                    disabled={!guessInput.trim() || judging || guessResult?.final}
                    style={{
                      ...styles.btnPrimary,
                      opacity: guessInput.trim() && !judging ? 1 : 0.4,
                      minWidth: "80px",
                    }}
                  >
                    {judging ? "..." : "Submit"}
                  </button>
                </div>
                {guessResult && (
                  <div
                    style={{
                      ...styles.guessResultBox,
                      backgroundColor: guessResult.correct ? "#e8f5e9" : "#fff3e0",
                      borderColor: guessResult.correct ? "#66bb6a" : "#ffb74d",
                      animation: "fadeUp 0.3s ease-out",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>
                      {guessResult.correct
                        ? "✅ Correct!"
                        : guessResult.final
                        ? "❌ Out of guesses!"
                        : `❌ Not quite — ${guessResult.attemptsLeft} guess${guessResult.attemptsLeft === 1 ? "" : "es"} left`}
                    </span>
                    {guessResult.explanation && (
                      <span style={{ display: "block", marginTop: "4px", fontWeight: 500, fontSize: "13px", color: "#555" }}>
                        {guessResult.explanation}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!gameOver && !pendingFinalGroup && remainingWords.length > 0 && (
            <div style={styles.grid}>
              {remainingWords.map((word) => {
                const isSelected = selected.includes(word);
                const isShaking = shakeIds.includes(word);
                return (
                  <button
                    key={word}
                    onClick={() => toggleSelect(word)}
                    style={{
                      ...styles.tile,
                      ...(isSelected ? styles.tileSelected : {}),
                      animation: isShaking ? "shake 0.4s ease-in-out" : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontSize: word.length > 10 ? "11px" : word.length > 7 ? "13px" : "15px",
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        lineHeight: "1.2",
                        textAlign: "center",
                      }}
                    >
                      {word}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {oneAway && <div style={styles.oneAway}>One away!</div>}

        {!pendingFinalGroup && (
          <div style={styles.mistakesRow}>
            <span style={styles.mistakesLabel}>Mistakes remaining:</span>
            <div style={styles.dots}>
              {mistakeDots.map((active, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dot,
                    backgroundColor: active ? "#1a1a1a" : "#ddd",
                    transform: active ? "scale(1)" : "scale(0.7)",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {!gameOver && !pendingFinalGroup ? (
          <div style={styles.actions}>
            <button onClick={handleShuffle} style={styles.btnOutline}>Shuffle</button>
            <button
              onClick={handleDeselectAll}
              style={{ ...styles.btnOutline, opacity: selected.length > 0 ? 1 : 0.4 }}
              disabled={selected.length === 0}
            >
              Deselect All
            </button>
          </div>
        ) : gameOver ? (
          <div style={{ textAlign: "center", animation: "fadeUp 0.5s ease-out" }}>
            <p style={styles.endMessage}>
              {won ? "🎉 Brilliant!" : "Better luck next time!"}
            </p>
            <button onClick={generatePuzzle} style={styles.btnPrimary}>
              New Puzzle
            </button>
          </div>
        ) : null}

        {!gameOver && !pendingFinalGroup && (
          <div style={styles.bottomActions}>
            <button onClick={generatePuzzle} style={styles.btnGhost}>New puzzle →</button>
          </div>
        )}
      </div>
    </div>
  );
}

const animationCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&display=swap');

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }

  @keyframes popIn {
    0% { transform: scale(0.8); opacity: 0; }
    60% { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes fadeUp {
    0% { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.08); }
  }

  @keyframes glow {
    0%, 100% { box-shadow: 0 0 8px rgba(186,129,197,0.3); }
    50% { box-shadow: 0 0 20px rgba(186,129,197,0.6); }
  }
`;

const styles = {
  outer: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "32px 16px",
    background: "#FAFAF8",
    fontFamily: "'Libre Franklin', sans-serif",
  },
  container: { width: "100%", maxWidth: 520 },
  title: {
    fontSize: "32px",
    fontWeight: 800,
    textAlign: "center",
    color: "#1a1a1a",
    margin: "0 0 6px",
    letterSpacing: "-0.02em",
  },
  badgeRow: { display: "flex", justifyContent: "center", marginBottom: "10px" },
  badge: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#fff",
    background: "linear-gradient(135deg, #1a1a1a, #444)",
    padding: "5px 16px",
    borderRadius: "20px",
  },
  subtitle: {
    fontSize: "15px",
    fontWeight: 500,
    textAlign: "center",
    color: "#6b6b6b",
    margin: "0 0 16px",
    lineHeight: "1.5",
  },
  subtitleAccent: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#9b59b6",
  },
  board: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
  },
  solvedRow: {
    borderRadius: "10px",
    padding: "16px",
    textAlign: "center",
  },
  solvedName: {
    fontWeight: 800,
    fontSize: "16px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "2px",
  },
  solvedWords: { fontSize: "14px", fontWeight: 500 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
  },
  tile: {
    aspectRatio: "1.4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    backgroundColor: "#EFEFE6",
    color: "#1a1a1a",
    textTransform: "uppercase",
    transition: "all 0.15s ease",
    padding: "8px 4px",
    fontFamily: "'Libre Franklin', sans-serif",
  },
  tileSelected: {
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    transform: "scale(0.97)",
  },
  finalGroupBox: {
    background: "#fff",
    border: "2px solid #BA81C5",
    borderRadius: "14px",
    padding: "24px 20px",
    textAlign: "center",
    animation: "glow 2s ease-in-out infinite",
  },
  finalGroupWords: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    marginBottom: "16px",
  },
  finalWord: {
    fontSize: "15px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    background: "#f3e8f9",
    color: "#6a1b9a",
    padding: "8px 16px",
    borderRadius: "8px",
  },
  finalPrompt: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#1a1a1a",
    margin: "0 0 14px",
  },
  guessRow: {
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    alignItems: "center",
  },
  guessInput: {
    flex: 1,
    maxWidth: "300px",
    padding: "10px 16px",
    borderRadius: "24px",
    border: "1.5px solid #ccc",
    fontSize: "14px",
    fontFamily: "'Libre Franklin', sans-serif",
    fontWeight: 500,
    outline: "none",
    transition: "border-color 0.2s",
  },
  guessResultBox: {
    marginTop: "12px",
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1.5px solid",
    fontSize: "14px",
    color: "#1a1a1a",
  },
  oneAway: {
    textAlign: "center",
    fontSize: "14px",
    fontWeight: 700,
    color: "#b85c00",
    backgroundColor: "#fff3e0",
    padding: "8px 16px",
    borderRadius: "8px",
    marginBottom: "8px",
    animation: "fadeUp 0.3s ease-out",
  },
  mistakesRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "20px",
  },
  mistakesLabel: { fontSize: "14px", fontWeight: 500, color: "#555" },
  dots: { display: "flex", gap: "6px" },
  dot: { width: "14px", height: "14px", borderRadius: "50%" },
  actions: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  btnOutline: {
    padding: "10px 22px",
    borderRadius: "24px",
    border: "1.5px solid #1a1a1a",
    background: "transparent",
    color: "#1a1a1a",
    fontFamily: "'Libre Franklin', sans-serif",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 28px",
    borderRadius: "24px",
    border: "none",
    background: "#1a1a1a",
    color: "#fff",
    fontFamily: "'Libre Franklin', sans-serif",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "8px 16px",
    borderRadius: "24px",
    border: "none",
    background: "transparent",
    color: "#888",
    fontFamily: "'Libre Franklin', sans-serif",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  endMessage: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: "16px",
  },
  bottomActions: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    marginTop: "16px",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "60px 0",
  },
  spinnerWrapper: { display: "flex", gap: "10px", marginBottom: "24px" },
  loadingTile: {
    width: "48px",
    height: "48px",
    borderRadius: "10px",
    backgroundColor: "#EFEFE6",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  loadingText: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#1a1a1a",
    margin: "0 0 4px",
  },
  loadingSubtext: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#999",
    margin: 0,
  },
  errorContainer: { textAlign: "center", padding: "60px 0" },
  errorText: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#c0392b",
    marginBottom: "16px",
  },
};