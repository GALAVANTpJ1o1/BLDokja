function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;

    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
        button.textContent = nextTheme === "dark" ? "Light" : "Dark";
        button.setAttribute("aria-label", `Switch to ${button.textContent.toLowerCase()} mode`);
    }
}

function setupThemeToggle() {
    const savedTheme = localStorage.getItem("letterPairTheme") || "light";
    applyTheme(savedTheme);

    const button = document.querySelector("[data-theme-toggle]");
    if (!button) {
        return;
    }

    button.addEventListener("click", () => {
        const currentTheme = document.documentElement.dataset.theme || "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        localStorage.setItem("letterPairTheme", nextTheme);
        applyTheme(nextTheme);
    });
}

function setupScrollRestore() {
    const restoreValue = sessionStorage.getItem("letterPairScrollY");
    if (restoreValue !== null) {
        sessionStorage.removeItem("letterPairScrollY");
        window.requestAnimationFrame(() => {
            window.scrollTo(0, Number(restoreValue) || 0);
        });
    }

    document.querySelectorAll("form").forEach((form) => {
        form.addEventListener("submit", () => {
            sessionStorage.setItem("letterPairScrollY", String(window.scrollY));
        });
    });
}

function focusFirstInput() {
    const input = document.querySelector("input[autofocus], input[name='word']");
    if (input) {
        input.focus();
    }
}

function normalizeVisibleAnswer(input) {
    input.value = input.value.toUpperCase().replace(/[^A-X]/g, "");
}

function setupPairInputs() {
    document.querySelectorAll("input[name='pair']").forEach((input) => {
        input.addEventListener("input", () => normalizeVisibleAnswer(input));
    });
}

function setupRevealAnswer() {
    const button = document.querySelector("[data-reveal-answer]");
    const pairDisplay = document.querySelector("[data-current-pair]");
    if (!button || !pairDisplay) {
        return;
    }

    const nextButton = document.querySelector("[data-next-pair]");
    const resultPanel = document.querySelector("[data-result-panel]");
    let answerBox = document.querySelector("[data-revealed-answer]");

    if (!answerBox && resultPanel) {
        answerBox = document.createElement("div");
        answerBox.className = "revealed-answer";
        answerBox.dataset.revealedAnswer = "";
        resultPanel.appendChild(answerBox);
    }

    const renderReveal = (children) => {
        if (!answerBox) {
            return;
        }
        answerBox.classList.remove("hidden");
        answerBox.replaceChildren(...children);
    };

    const createElement = (tagName, className, text) => {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        element.textContent = text;
        return element;
    };

    button.addEventListener("click", async () => {
        const pair = pairDisplay.dataset.currentPair;
        button.disabled = true;
        button.textContent = "Revealing...";

        try {
            const response = await fetch(`/api/pairs/${encodeURIComponent(pair)}/words`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not reveal the answer.");
            }

            const top = data.top_word;
            if (top) {
                const metric = document.createElement("div");
                metric.className = "metric-row";
                metric.append(
                    createElement("span", "", "Uses"),
                    createElement("strong", "", String(top.count)),
                );
                renderReveal([
                    createElement("p", "eyebrow", "Revealed"),
                    createElement("h2", "", `${data.pair} -> ${top.word}`),
                    metric,
                ]);
            } else {
                renderReveal([
                    createElement("p", "eyebrow", "Revealed"),
                    createElement("h2", "", `No word saved for ${data.pair} yet.`),
                    createElement("p", "muted", "Add one from the Database page or type an answer here."),
                ]);
            }

            if (nextButton) {
                nextButton.classList.remove("hidden");
            }
            button.textContent = "Answer Revealed";
        } catch (error) {
            renderReveal([
                createElement("p", "eyebrow", "Error"),
                createElement("p", "muted", error.message),
            ]);
            button.disabled = false;
            button.textContent = "Reveal Common Word";
        }
    });
}

async function playMemoSequence(root) {
    const corners = root.dataset.corners || "";
    const edges = root.dataset.edges || "";
    const speedMs = Number(root.dataset.speedMs || 3000);
    const betweenMs = Number(root.dataset.betweenMs || 5000);
    const status = root.querySelector("[data-memo-status]");
    const letter = root.querySelector("[data-memo-letter]");
    const progress = root.querySelector("[data-memo-progress]");
    const controls = root.querySelector("[data-memo-controls]");
    const recall = root.querySelector("[data-memo-recall]");

    controls.classList.add("hidden");
    recall.classList.add("hidden");
    letter.textContent = "-";

    for (let index = 0; index < corners.length; index += 1) {
        status.textContent = "Corners";
        letter.textContent = corners[index];
        progress.textContent = `${index + 1} / ${corners.length}`;
        await sleep(speedMs);
    }

    status.textContent = "Switching to edges";
    letter.textContent = "-";
    progress.textContent = `${Math.round(betweenMs / 1000)} second pause`;
    await sleep(betweenMs);

    for (let index = 0; index < edges.length; index += 1) {
        status.textContent = "Edges";
        letter.textContent = edges[index];
        progress.textContent = `${index + 1} / ${edges.length}`;
        await sleep(speedMs);
    }

    status.textContent = "Preparing recall";
    letter.textContent = "-";
    progress.textContent = `${Math.round(betweenMs / 1000)} second pause`;
    await sleep(betweenMs);

    status.textContent = "Recall";
    progress.textContent = "Type edges first, then corners.";
    recall.classList.remove("hidden");
    const edgeInput = recall.querySelector("input[name='edges_answer']");
    if (edgeInput) {
        edgeInput.focus();
    }
}

function setupMemoTrainer() {
    const trainer = document.querySelector(".memo-trainer");
    if (!trainer) {
        return;
    }

    const startButton = trainer.querySelector("[data-memo-start]");
    if (startButton) {
        startButton.addEventListener("click", () => {
            startButton.disabled = true;
            playMemoSequence(trainer);
        });
    }

    trainer.querySelectorAll(".recall-form input[type='text']").forEach((input) => {
        input.addEventListener("input", () => normalizeVisibleAnswer(input));
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupThemeToggle();
    setupScrollRestore();
    setupPairInputs();
    setupRevealAnswer();
    focusFirstInput();
    setupMemoTrainer();
});
