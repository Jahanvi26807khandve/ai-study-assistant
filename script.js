const $ = (id) => document.getElementById(id);   // shortcut for getElementById
let current = null;                               // result currently shown

// ---------- Fake data (Day 2 replaces this with the real AI reply) ----------
const fake = {
  summary: "Photosynthesis is how plants turn light into food. Chlorophyll in the chloroplasts absorbs sunlight and the plant converts carbon dioxide and water into glucose, releasing oxygen.",
  quiz: [
    { question: "Where does photosynthesis happen?", options: ["Nucleus", "Chloroplast", "Ribosome", "Vacuole"], answer: 1 },
    { question: "Which gas do plants take in?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], answer: 2 },
    { question: "Which pigment absorbs sunlight?", options: ["Chlorophyll", "Melanin", "Keratin", "Insulin"], answer: 0 },
    { question: "Which sugar is produced?", options: ["Lactose", "Glucose", "Maltose", "Sucrose"], answer: 1 },
    { question: "Which gas is released?", options: ["Methane", "Hydrogen", "Oxygen", "Argon"], answer: 2 }
  ],
  flashcards: [
    { front: "Chlorophyll", back: "Green pigment that absorbs sunlight" },
    { front: "Chloroplast", back: "Where photosynthesis happens" },
    { front: "Glucose", back: "Sugar the plant makes as food" },
    { front: "Stomata", back: "Leaf pores for gas exchange" },
    { front: "Inputs", back: "Carbon dioxide, water, light" },
    { front: "Outputs", back: "Glucose and oxygen" }
  ]
};

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

// ---------- Main flow ----------
async function generate() {
  $("message").hidden = true;
  const notes = $("notes").value.trim();
  if (!notes) return showMsg("Please enter notes or a topic first.");
  setLoading(true);
  try {
    await new Promise((r) => setTimeout(r, 1000));            // DAY 2: real API call goes here
    renderAll(fake);
    saveHistory(notes, fake);
    showTab("summary");
  } catch (error) {
    showMsg("Error: " + error.message);
  } finally {
    setLoading(false);                                        // always runs
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