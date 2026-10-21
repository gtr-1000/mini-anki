
const $ = (selector) => document.querySelector(selector);

let cards = [];
let session = [];
let sessionIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let editingId = null;
let showingAnswer = false;
let submittingReview = false;

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    const data = contentType.includes("application/json")
        ? await response.json()
        : null;

    if (!response.ok) {
        throw new Error(data?.error || `Erro HTTP ${response.status}`);
    }

    return data;
}

function setMessage(selector, message, isError = false) {
    const element = $(selector);
    element.textContent = message;
    element.style.color = isError ? "#a4433b" : "";
}

function updateStats() {
    $("#totalCount").textContent = cards.length;
    $("#dueCount").textContent = cards.filter(isDue).length;
    $("#correctCount").textContent = correctCount;
    $("#wrongCount").textContent = wrongCount;
    $("#libraryCount").textContent =
        `${cards.length} ${cards.length === 1 ? "cartão" : "cartões"}`;
}

function isDue(card) {
    if (!card.due_at) return true;

    const dueTime = Date.parse(card.due_at);

    return !Number.isFinite(dueTime) || dueTime <= Date.now();
}

function formatDue(card) {
    if (!card.due_at) return "Novo · ainda não revisado";

    const dueTime = Date.parse(card.due_at);

    if (!Number.isFinite(dueTime)) return "Data de revisão inválida";

    if (dueTime <= Date.now()) return "Disponível para revisão";

    return `Próxima revisão: ${new Date(dueTime).toLocaleString("pt-BR")}`;
}

async function loadCards() {
    try {
        cards = await api("/api/cards");
        renderCardList();
        updateStats();
    } catch (error) {
        setMessage("#formMessage", error.message, true);
        $("#cardList").textContent = "Não foi possível carregar os cartões.";
    }
}

function renderCardList() {
    const list = $("#cardList");
    list.replaceChildren();

    if (cards.length === 0) {
        list.textContent = "Sua biblioteca está vazia. Adicione seu primeiro cartão.";
        return;
    }

    for (const card of cards) {
        const item = document.createElement("article");
        item.className = "library-card";

        const details = document.createElement("div");

        const word = document.createElement("h3");
        word.textContent = card.word;

        const translation = document.createElement("p");
        translation.textContent = card.translation;

        const example = document.createElement("p");
        example.className = "muted";
        example.textContent = card.example || "Sem exemplo.";

        const meta = document.createElement("p");
        meta.className = "card-meta";
        meta.textContent = `${formatDue(card)} · Intervalo: ${card.interval_days} dia(s)`;

        details.append(word, translation, example, meta);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "button button-light";
        editButton.textContent = "Editar";
        editButton.addEventListener("click", () => beginEdit(card));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "button button-danger";
        deleteButton.textContent = "Excluir";
        deleteButton.addEventListener("click", () => deleteCard(card));

        actions.append(editButton, deleteButton);
        item.append(details, actions);
        list.append(item);
    }
}

function beginEdit(card) {
    editingId = card.id;

    $("#wordInput").value = card.word;
    $("#translationInput").value = card.translation;
    $("#exampleInput").value = card.example || "";

    $("#saveButton").textContent = "Salvar alterações";
    $("#cancelEditButton").hidden = false;

    setMessage("#formMessage", `Editando: ${card.word}`);
    $("#wordInput").focus();
    $("#cardForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetForm() {
    editingId = null;
    $("#cardForm").reset();
    $("#saveButton").textContent = "Adicionar cartão";
    $("#cancelEditButton").hidden = true;
}

$("#cardForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
        word: $("#wordInput").value.trim(),
        translation: $("#translationInput").value.trim(),
        example: $("#exampleInput").value.trim()
    };

    if (!payload.word || !payload.translation) {
        setMessage("#formMessage", "Palavra e tradução são obrigatórias.", true);
        return;
    }

    const wasEditing = editingId !== null;
    const url = wasEditing ? `/api/cards/${editingId}` : "/api/cards";
    const method = wasEditing ? "PUT" : "POST";

    $("#saveButton").disabled = true;

    try {
        await api(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        resetForm();
        setMessage(
            "#formMessage",
            wasEditing ? "Cartão atualizado." : "Cartão cadastrado."
        );

        await loadCards();
        await refreshDueCount();
    } catch (error) {
        setMessage("#formMessage", error.message, true);
    } finally {
        $("#saveButton").disabled = false;
    }
});

$("#cancelEditButton").addEventListener("click", () => {
    resetForm();
    setMessage("#formMessage", "Edição cancelada.");
});

async function deleteCard(card) {
    const confirmed = confirm(
        `Excluir "${card.word}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    try {
        await api(`/api/cards/${card.id}`, { method: "DELETE" });

        session = session.filter((item) => item.id !== card.id);

        if (editingId === card.id) resetForm();

        await loadCards();
        await refreshDueCount();

        setMessage("#formMessage", "Cartão excluído.");
        showSessionCard();
    } catch (error) {
        setMessage("#formMessage", error.message, true);
    }
}

async function refreshDueCount() {
    try {
        const dueCards = await api("/api/cards?due=1");
        $("#dueCount").textContent = dueCards.length;
    } catch (error) {
        console.error("Erro ao atualizar revisões pendentes:", error);
    }
}

function setStudyButtons({ start = false, reveal = false, grade = false } = {}) {
    $("#startButton").hidden = !start;
    $("#revealButton").hidden = !reveal;
    $("#wrongButton").hidden = !grade;
    $("#correctButton").hidden = !grade;
}

function startStudy() {
    session = cards.filter(isDue);
    sessionIndex = 0;
    showingAnswer = false;
    submittingReview = false;
    correctCount = 0;
    wrongCount = 0;

    updateStats();
    setMessage("#studyMessage", "");

    if (session.length === 0) {
        $("#cardPrompt").textContent = "Tudo em dia.";
        $("#studyWord").textContent = "Nenhuma revisão pendente";
        $("#answerArea").hidden = true;
        $("#progress").textContent = "Sessão vazia";
        setMessage(
            "#studyMessage",
            "Cadastre cartões ou volte quando chegar a próxima revisão."
        );
        setStudyButtons({ start: true });
        return;
    }

    $("#progress").textContent = `${session.length} cartões na sessão`;
    showSessionCard();
}

function showSessionCard() {
    showingAnswer = false;

    if (sessionIndex >= session.length) {
        $("#cardPrompt").textContent = "Sessão concluída";
        $("#studyWord").textContent = "Muito bem!";
        $("#answerArea").hidden = true;
        $("#progress").textContent = "Concluída";
        setMessage(
            "#studyMessage",
            `Resultado: ${correctCount} acerto(s) e ${wrongCount} erro(s).`
        );
        setStudyButtons({ start: true });
        $("#startButton").textContent = "Iniciar nova sessão";
        refreshDueCount();
        return;
    }

    const card = session[sessionIndex];

    $("#cardPrompt").textContent = "Qual é o significado desta palavra?";
    $("#studyWord").textContent = card.word;
    $("#studyTranslation").textContent = card.translation;
    $("#studyExample").textContent = card.example || "Nenhum exemplo cadastrado.";
    $("#answerArea").hidden = true;
    $("#progress").textContent =
        `Cartão ${sessionIndex + 1} de ${session.length}`;

    setStudyButtons({ reveal: true });
}

function revealAnswer() {
    if (sessionIndex >= session.length) return;

    showingAnswer = true;
    $("#answerArea").hidden = false;
    setStudyButtons({ grade: true });
}

async function gradeCard(result) {
    if (!showingAnswer || submittingReview || sessionIndex >= session.length) {
        return;
    }

    submittingReview = true;
    $("#wrongButton").disabled = true;
    $("#correctButton").disabled = true;

    const card = session[sessionIndex];

    try {
        const updated = await api(`/api/cards/${card.id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ result })
        });

        if (result === "correct") correctCount++;
        else wrongCount++;

        const existing = cards.find((item) => item.id === card.id);

        if (existing) {
            existing.interval_days = updated.interval_days;
            existing.due_at = updated.due_at;
        }

        sessionIndex++;
        await loadCards();
        showSessionCard();
        updateStats();
        await refreshDueCount();
    } catch (error) {
        setMessage("#studyMessage", error.message, true);
    } finally {
        submittingReview = false;
        $("#wrongButton").disabled = false;
        $("#correctButton").disabled = false;
    }
}

$("#startButton").addEventListener("click", startStudy);
$("#revealButton").addEventListener("click", revealAnswer);
$("#wrongButton").addEventListener("click", () => gradeCard("wrong"));
$("#correctButton").addEventListener("click", () => gradeCard("correct"));

$("#exportButton").addEventListener("click", () => {
    window.location.href = "/api/export.csv";
});

$("#importButton").addEventListener("click", async () => {
    const file = $("#csvFile").files[0];

    if (!file) {
        setMessage("#formMessage", "Selecione um arquivo CSV primeiro.", true);
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    $("#importButton").disabled = true;

    try {
        const result = await api("/api/import.csv", {
            method: "POST",
            body: formData
        });

        $("#csvFile").value = "";
        setMessage("#formMessage", result.message);
        await loadCards();
        await refreshDueCount();
    } catch (error) {
        setMessage("#formMessage", error.message, true);
    } finally {
        $("#importButton").disabled = false;
    }
});

async function init() {
    await loadCards();
    await refreshDueCount();
    setStudyButtons({ start: true });
}

init();
