const $ = (id) => document.getElementById(id);   // shortcut for getElementById
let current = null;                               // result currently shown

// ---------- Settings for the AI ----------
// The app tries these models in order. If one is busy or missing, it moves to the next.
const MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"];
const urlFor = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Builds an element. textContent is safe: AI text can never inject HTML.
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

// ---------- Theme ----------
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", theme);
}

// ---------- API key + messages ----------
function showMsg(text) { $("message").textContent = text; $("message").hidden = false; }

function saveKey() {
  const key = $("apiKey").value.trim();
  if (!key) return showMsg("Paste an API key first.");
  localStorage.setItem("apiKey", key);
  showMsg("API key saved in this browser.");
}

// ---------- Loading + tabs ----------
function setLoading(on) {
  $("loader").hidden = !on;
  $("generateBtn").disabled = on;               // stops double clicks
  $("generateBtn").textContent = on ? "Generating..." : "Generate";
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.toggle("active", c.id === name));
}

// ---------- 1) Build the instruction for the AI ----------
function buildPrompt(notes) {
  return `You are a study assistant. From the notes below, reply ONLY with valid JSON,
no extra text, in exactly this format:
{
  "summary": "a short summary",
  "quiz": [
    { "question": "...", "options": ["A", "B", "C", "D"], "answer": 0 }
  ],
  "flashcards": [
    { "front": "term", "back": "definition" }
  ]
}
Rules: exactly 5 quiz questions, "answer" is the index (0 to 3) of the correct option,
and 6 to 8 flashcards.

Notes:
${notes}`;
}

// ---------- 2) Send the request to the AI ----------
// Makes an error and marks whether trying another model could help
function fail(message, canRetry) {
  const error = new Error(message);
  error.canRetry = canRetry;
  return error;
}

// Sends the request to ONE model
async function requestModel(model, prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);   // give up after 60 seconds

  let response;
  try {
    response = await fetch(urlFor(model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw fail("The AI took too long. Try again.", true);
    throw fail("Network error. Check your internet connection and try again.", false);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const s = response.status;
    if (s === 400 || s === 401 || s === 403)
      throw fail("Your API key looks wrong or not allowed (error " + s + "). Check Settings.", false);
    if (s === 404) throw fail("Model not found (404).", true);
    if (s === 429) throw fail("Too many requests (429). Wait a minute and try again.", true);
    throw fail("The AI server is busy (" + s + "). Try again in a minute.", true);
  }

  const data = await response.json();
  console.log("Model used:", model, "| Full API response:", data);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw fail("The AI sent an empty reply. Try again.", true);
  return text;
}

// Tries each model in order until one works
async function callAPI(prompt) {
  const apiKey = localStorage.getItem("apiKey");
  if (!apiKey) throw new Error("No API key. Add your key in Settings and click Save key.");

  let lastError;
  for (const model of MODELS) {
    try {
      return await requestModel(model, prompt, apiKey);
    } catch (error) {
      lastError = error;
      if (!error.canRetry) throw error;   // wrong key or no internet: other models won't help
    }
  }
  throw lastError;                        // every model failed
}
// ---------- 3) Turn the AI text into a checked object ----------
function parseResponse(text) {
  // Some models wrap JSON in ```json fences, so remove them first
  const cleaned = text.replace(/```json|```/g, "").trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error("The AI reply was not valid JSON. Click Generate again.");
  }

  // Validate: make sure everything we need exists
  const quizOk = Array.isArray(result.quiz) && result.quiz.length > 0 &&
    result.quiz.every((q) => q.question && Array.isArray(q.options) && Number.isInteger(q.answer) && q.options[q.answer] !== undefined);
  const cardsOk = Array.isArray(result.flashcards) && result.flashcards.length > 0 &&
    result.flashcards.every((c) => c.front && c.back);

  if (typeof result.summary !== "string" || !result.summary || !quizOk || !cardsOk)
    throw new Error("The AI reply was missing the summary, quiz or flashcards. Click Generate again.");

  return result;
}

// ---------- Render functions ----------
function renderSummary(text) { $("summary").replaceChildren(el("p", "", text)); }

function renderQuiz(quiz) {
  const box = $("quiz");
  box.replaceChildren();
  quiz.forEach((q, i) => {
    const group = el("div", "question");
    group.append(el("p", "", `${i + 1}. ${q.question}`));
    q.options.forEach((opt, j) => {
      const label = el("label", "option");
      const radio = el("input");
      radio.type = "radio"; radio.name = "q" + i; radio.value = j;
      label.append(radio, " " + opt);
      group.append(label);
    });
    box.append(group);
  });
  const score = el("p", "score");
  const btn = el("button", "btn main-btn", "Check answers");
  btn.onclick = () => {
    let correct = 0;
    quiz.forEach((q, i) => {
      const labels = box.querySelectorAll(".question")[i].querySelectorAll(".option");
      const picked = box.querySelector(`input[name="q${i}"]:checked`);
      labels[q.answer].classList.add("correct");             // show the right answer
      if (picked && Number(picked.value) === q.answer) correct++;
      else if (picked) labels[Number(picked.value)].classList.add("wrong");
    });
    score.textContent = `Score: ${correct} / ${quiz.length}`;
  };
  box.append(btn, score);
}

function renderFlashcards(cards) {
  const box = el("div", "cards");
  cards.forEach((c) => {
    const card = el("div", "card", c.front);
    card.onclick = () => {                                    // click = flip
      const flipped = card.classList.toggle("flipped");
      card.textContent = flipped ? c.back : c.front;
    };
    box.append(card);
  });
  $("flashcards").replaceChildren(box);
}

function renderAll(result) {
  current = result;
  renderSummary(result.summary);
  renderQuiz(result.quiz);
  renderFlashcards(result.flashcards);
}

// ---------- Copy + download ----------
async function copySummary() {
  if (!current) return showMsg("Generate something first.");
  try { await navigator.clipboard.writeText(current.summary); showMsg("Summary copied."); }
  catch { showMsg("Could not copy. Clipboard blocked."); }
}

function downloadSummary() {
  if (!current) return showMsg("Generate something first.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([current.summary], { type: "text/plain" }));
  link.download = "summary.txt";
  link.click();
}

// ---------- History (localStorage only stores strings, so we use JSON) ----------
function getHistory() {
  try { return JSON.parse(localStorage.getItem("history")) || []; }
  catch { return []; }
}

function saveHistory(notes, result) {
  const list = getHistory();
  list.unshift({ date: new Date().toLocaleString(), notes, result });
  localStorage.setItem("history", JSON.stringify(list.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const ul = $("historyList");
  ul.replaceChildren();
  getHistory().forEach((item) => {
    const li = el("li");
    const btn = el("button", "", item.notes.slice(0, 30) + " (" + item.date + ")");
    btn.onclick = () => { renderAll(item.result); showTab("summary"); };
    li.append(btn);
    ul.append(li);
  });
}

// ---------- Main flow: runs when Generate is clicked ----------
async function generate() {
  $("message").hidden = true;
  const notes = $("notes").value.trim();
  if (!notes) return showMsg("Please enter notes or a topic first.");
  setLoading(true);
  try {
    const prompt = buildPrompt(notes);       // step 1
    const text = await callAPI(prompt);      // step 2
    const result = parseResponse(text);      // step 3
    renderAll(result);
    saveHistory(notes, result);
    showTab("summary");
  } catch (error) {
    showMsg(error.message);                  // shows our clear error message
  } finally {
    setLoading(false);                       // always runs
  }
}

// ---------- Start-up ----------
$("generateBtn").onclick = generate;
$("saveKeyBtn").onclick = saveKey;
$("copyBtn").onclick = copySummary;
$("downloadBtn").onclick = downloadSummary;
$("clearBtn").onclick = () => { localStorage.removeItem("history"); renderHistory(); };
$("themeBtn").onclick = () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));

setTheme(localStorage.getItem("theme") || "light");
$("apiKey").value = localStorage.getItem("apiKey") || "";
renderHistory();